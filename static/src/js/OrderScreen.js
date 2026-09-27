/** @odoo-module **/

import { patch } from "@web/core/utils/patch";
import { ConfirmPopup } from "@point_of_sale/app/utils/confirm_popup/confirm_popup";
import { Order, Orderline } from "@point_of_sale/app/store/models";
import { ProductScreen } from "@point_of_sale/app/screens/product_screen/product_screen";
import { PosStore } from "@point_of_sale/app/store/pos_store";
import { PosBus } from "@point_of_sale/app/bus/pos_bus_service";
import { ProductCard } from "@point_of_sale/app/generic_components/product_card/product_card";
import { usePos } from "@point_of_sale/app/store/pos_hook";
import { _t } from "@web/core/l10n/translation";

function isStockChecked(product, config) {
    return (
        product &&
        config?.restrict_out_of_stock &&
        product.type !== "service" &&
        !product.to_weight
    );
}

function isDepleted(product, config, quantity = 0) {
    const onHand = (Number(product.qty_available) || 0) - quantity;
    const forecast = (Number(product.virtual_available) || 0) - quantity;
    // A product with exactly enough stock is available; warn only when the
    // requested/order quantity would make the remaining stock negative.
    const depleted = (value) => (quantity > 0 ? value < 0 : value <= 0);
    if (config.stock_check_type === "forecast") {
        return depleted(forecast);
    }
    if (config.stock_check_type === "both_qty") {
        return depleted(onHand) || depleted(forecast);
    }
    return depleted(onHand);
}

function orderQuantity(order, product) {
    return (order?.orderlines || [])
        .filter((line) => line.get_product()?.id === product?.id)
        .reduce((total, line) => total + line.get_quantity(), 0);
}

async function confirmOutOfStock(order, product, quantity = 0) {
    const config = order.pos.config;
    if (!isStockChecked(product, config) || !isDepleted(product, config, quantity)) {
        return true;
    }
    const { confirmed } = await order.env.services.popup.add(ConfirmPopup, {
        title: _t("Out of Stock Warning"),
        body: _t("%s is out of stock. Do you want to proceed?", product.display_name),
        confirmText: _t("Order"),
        cancelText: _t("Cancel"),
    });
    return confirmed;
}

patch(Order.prototype, {
    async add_product(product, options = {}) {
        const quantity = Number(options.quantity) || 1;
        const orderedQuantity = orderQuantity(this, product);
        if (
            !options.oaStockConfirmed &&
            !(await confirmOutOfStock(this, product, orderedQuantity + quantity))
        ) {
            return;
        }
        return super.add_product(product, options);
    },

    async pay() {
        const config = this.pos.config;
        const depletedProducts = [];
        if (config.restrict_out_of_stock) {
            const quantities = new Map();
            for (const line of this.orderlines) {
                const product = line.get_product();
                if (!isStockChecked(product, config)) {
                    continue;
                }
                quantities.set(product, (quantities.get(product) || 0) + line.get_quantity());
            }
            for (const [product, quantity] of quantities) {
                if (isDepleted(product, config, quantity)) {
                    depletedProducts.push(product.display_name);
                }
            }
        }

        if (depletedProducts.length) {
            const { confirmed } = await this.env.services.popup.add(ConfirmPopup, {
                title: _t("Out of Stock Warning"),
                body: _t(
                    "%s is out of stock. Click Order if you still want to proceed with payment.",
                    depletedProducts.join(", ")
                ),
                confirmText: _t("Order"),
                cancelText: _t("Cancel"),
            });
            if (!confirmed) {
                return;
            }
        }
        return super.pay();
    },
});

patch(ProductCard.prototype, {
    setup(...args) {
        super.setup(...args);
        this.pos = usePos();
    },

    get product() {
        return this.pos.db.get_product_by_id(this.props.productId);
    },

    get posConfig() {
        return this.pos.config || {};
    },

    get orderQuantity() {
        // Reading this reactive counter makes all product cards refresh after
        // adding, changing, decreasing, or clearing an order line.
        void this.pos._oaStockVersion;
        return orderQuantity(this.pos.get_order(), this.product);
    },

    get stockQtyAvailable() {
        return (Number(this.product?.qty_available) || 0) - this.orderQuantity;
    },

    get stockVirtualAvailable() {
        return (Number(this.product?.virtual_available) || 0) - this.orderQuantity;
    },

    get showStock() {
        return Boolean(this.posConfig.show_pos_stock && this.product);
    },
});


patch(Orderline.prototype, {
    set_quantity(...args) {
        const result = super.set_quantity(...args);
        if (this.pos) {
            this.pos._oaStockVersion = (this.pos._oaStockVersion || 0) + 1;
        }
        return result;
    },
});

patch(Order.prototype, {
    async add_product(...args) {
        const result = await super.add_product(...args);
        if (this.pos) {
            this.pos._oaStockVersion = (this.pos._oaStockVersion || 0) + 1;
        }
        return result;
    },

    removeOrderline(...args) {
        const result = super.removeOrderline(...args);
        this.pos._oaStockVersion = (this.pos._oaStockVersion || 0) + 1;
        return result;
    },
});

patch(ProductScreen.prototype, {
    decreaseOrderlineQuantity(line) {
        const order = this.currentOrder;
        if (!order || !line || typeof line.get_quantity !== "function") {
            return;
        }

        const quantity = line.get_quantity();
        const newQuantity = quantity > 0
            ? Math.max(0, quantity - 1)
            : Math.min(0, quantity + 1);

        if (newQuantity === 0) {
            order.removeOrderline(line);
            return;
        }

        line.set_quantity(newQuantity, true);
        for (const comboLine of line.comboLines || []) {
            comboLine.set_quantity(newQuantity, true);
        }
    },

    clearOrderLines() {
        const order = this.currentOrder;
        if (!order || order.is_empty()) {
            return;
        }
        while (order.orderlines.length) {
            order.removeOrderline(order.orderlines[0]);
        }
        this.pos._oaStockVersion = (this.pos._oaStockVersion || 0) + 1;
    },
});

patch(PosStore.prototype, {
    async setup(...args) {
        await super.setup(...args);
        this._oaStockVersion = 0;
        this._oaStockRefreshInProgress = false;
        this._oaStockRefreshTimer = setInterval(() => this.refreshPosStock(), 5000);
        this.refreshPosStock();
    },

    add_new_order(...args) {
        const result = super.add_new_order(...args);
        this._oaStockVersion++;
        return result;
    },

    set_order(...args) {
        const result = super.set_order(...args);
        this._oaStockVersion++;
        return result;
    },

    async refreshPosStock(productIds = null) {
        if (!navigator.onLine || this._oaStockRefreshInProgress || !this.config) {
            return;
        }
        const products = productIds?.length
            ? productIds.map((id) => this.db.get_product_by_id(id)).filter(Boolean)
            : Object.values(this.db.product_by_id);
        const ids = products.map((product) => product.id).filter(Boolean);
        if (!ids.length) {
            return;
        }

        this._oaStockRefreshInProgress = true;
        try {
            const stockByProduct = await this.orm.silent.call(
                "product.product",
                "get_pos_stock_quantities",
                [ids, this.config.id]
            );
            for (const product of products) {
                const stock = stockByProduct?.[String(product.id)];
                if (stock) {
                    product.qty_available = Number(stock.qty_available) || 0;
                    product.virtual_available = Number(stock.virtual_available) || 0;
                }
            }
            this._oaStockVersion++;
            this.searchProductWord = this.searchProductWord;
        } finally {
            this._oaStockRefreshInProgress = false;
        }
    },

    _after_flush_orders(orders) {
        const result = super._after_flush_orders(...arguments);
        const productIds = new Set();
        for (const order of orders || []) {
            for (const line of order.data?.lines || []) {
                const rawProductId = line[2]?.product_id;
                const productId = Array.isArray(rawProductId) ? rawProductId[0] : rawProductId;
                if (productId) {
                    productIds.add(productId);
                }
            }
        }
        this.refreshPosStock([...productIds]);
        return result;
    },
});

patch(PosBus.prototype, {
    dispatch(message) {
        super.dispatch(...arguments);
        if (message.type === "OA_STOCK_UPDATE") {
            this.pos.refreshPosStock(message.payload?.product_ids || null);
        }
    },
});
