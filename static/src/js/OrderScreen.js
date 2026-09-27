/** @odoo-module */

import { PosStore } from "@point_of_sale/app/store/pos_store";
import { ControlButtons } from "@point_of_sale/app/screens/product_screen/control_buttons/control_buttons";
import { OrderSummary } from "@point_of_sale/app/screens/product_screen/order_summary/order_summary";
import { patch } from "@web/core/utils/patch";
import { ConfirmationDialog } from "@web/core/confirmation_dialog/confirmation_dialog";
import { _t } from "@web/core/l10n/translation";

const STOCK_REFRESH_INTERVAL = 5000;

patch(PosStore.prototype, {
    async setup(...args) {
        await super.setup(...args);
        this._oaStockRefreshInProgress = false;
        this.data.connectWebSocket("OA_STOCK_UPDATE", (data) => {
            this.refreshPosStock(data?.product_ids || []);
        });
        this._oaStockRefreshTimer = setInterval(() => {
            this.refreshPosStock();
        }, STOCK_REFRESH_INTERVAL);
        this.refreshPosStock();
    },

    _getOrderProductQuantities(order) {
        const quantities = new Map();
        if (!order || order.state !== "draft") {
            return quantities;
        }

        for (const line of order.lines) {
            const product = line.product_id;
            if (!product?.id || product.type === "service") {
                continue;
            }
            const current = quantities.get(product.id) || { product, quantity: 0 };
            current.quantity += line.get_quantity();
            quantities.set(product.id, current);
        }
        return quantities;
    },

    _adjustLocalStock(product, stockDelta) {
        if (!product || product.type === "service" || !stockDelta) {
            return;
        }

        product.update({
            qty_available: (Number(product.qty_available) || 0) + stockDelta,
            virtual_available: (Number(product.virtual_available) || 0) + stockDelta,
        });

        const template = product.product_tmpl_id;
        if (template) {
            template.update({
                qty_available: (Number(template.qty_available) || 0) + stockDelta,
                virtual_available: (Number(template.virtual_available) || 0) + stockDelta,
            });
        }
    },

    _applyOrderProductQuantityDelta(before, after) {
        const productIds = new Set([...before.keys(), ...after.keys()]);
        for (const productId of productIds) {
            const previous = before.get(productId);
            const current = after.get(productId);
            const stockDelta = (previous?.quantity || 0) - (current?.quantity || 0);
            this._adjustLocalStock(current?.product || previous?.product, stockDelta);
        }
    },

    async addLineToOrder(...args) {
        const order = args[1] || this.get_order();
        const before = this._getOrderProductQuantities(order);
        const result = await super.addLineToOrder(...args);
        if (result) {
            this._applyOrderProductQuantityDelta(before, this._getOrderProductQuantities(order));
        }
        return result;
    },

    async postSyncAllOrders(orders) {
        const result = await super.postSyncAllOrders(orders);
        const productIds = new Set();

        for (const order of orders || []) {
            for (const line of order.lines || []) {
                if (line.product_id?.id) {
                    productIds.add(line.product_id.id);
                }
            }
        }

        await this.refreshPosStock([...productIds]);
        return result;
    },

    async refreshPosStock(productIds = null) {
        if (this.data.network.offline || this._oaStockRefreshInProgress) {
            return;
        }

        const productModel = this.models["product.product"];
        if (!productModel) {
            return;
        }

        const products = productIds?.length
            ? productModel.readMany(productIds)
            : productModel.getAll();
        const ids = products.map((product) => product.id).filter(Boolean);
        if (!ids.length) {
            return;
        }

        this._oaStockRefreshInProgress = true;
        try {
            const stockByProduct = await this.data.silentCall(
                "product.product",
                "get_pos_stock_quantities",
                [ids, this.config.id]
            );
            if (!stockByProduct) {
                return;
            }

            const templateTotals = new Map();
            const currentOrderQuantities = this._getOrderProductQuantities(this.get_order());
            for (const product of products) {
                const stock = stockByProduct[String(product.id)];
                if (!stock) {
                    continue;
                }

                const orderedQuantity = currentOrderQuantities.get(product.id)?.quantity || 0;
                const qtyAvailable = (Number(stock.qty_available) || 0) - orderedQuantity;
                const virtualAvailable = (Number(stock.virtual_available) || 0) - orderedQuantity;
                product.update({ qty_available: qtyAvailable, virtual_available: virtualAvailable });

                const template = product.product_tmpl_id;
                if (template) {
                    const current = templateTotals.get(template.id) || {
                        qty_available: 0,
                        virtual_available: 0,
                    };
                    current.qty_available += qtyAvailable;
                    current.virtual_available += virtualAvailable;
                    templateTotals.set(template.id, current);
                }
            }

            const templateModel = this.models["product.template"];
            for (const [templateId, values] of templateTotals) {
                templateModel?.get(templateId)?.update(values);
            }
        } finally {
            this._oaStockRefreshInProgress = false;
        }
    },

    async pay() {
        const posConfig = this.config;
        const checkType = posConfig.stock_check_type;
        const depletedItems = [];

        if (posConfig.restrict_out_of_stock) {
            const currentOrder = this.get_order();
            if (currentOrder) {
                for (const line of currentOrder.lines) {
                    const item = line.product_id;
                    if (item && item.type !== 'service' && !item.to_weight) {
                        const onHandDepleted = item.qty_available <= 0;
                        const forecastDepleted = item.virtual_available <= 0;

                        let lineBlocked = false;
                        if (checkType === 'on_hand' && onHandDepleted) {
                            lineBlocked = true;
                        } else if (checkType === 'forecast' && forecastDepleted) {
                            lineBlocked = true;
                        } else if (checkType === 'both_qty' && (onHandDepleted || forecastDepleted)) {
                            lineBlocked = true;
                        }

                        if (lineBlocked) {
                            depletedItems.push(item.display_name);
                        }
                    }
                }
            }
        }

        if (depletedItems.length > 0) {
            this.dialog.add(ConfirmationDialog, {
                title: _t("Out of Stock Warning"),
                body: _t("%s is out of stock. Click Order if you still want to proceed with payment.", depletedItems.join(", ")),
                confirmLabel: _t("Order"),
                cancelLabel: _t("Cancel"),
                confirm: () => {
                    return super.pay();
                },
                cancel: () => {},
            });
            return;
        }

        return super.pay();
    }
});


patch(ControlButtons.prototype, {
    removeAllLines() {
        const order = this.pos.get_order();
        if (!order || order.is_empty()) {
            return;
        }

        const before = this.pos._getOrderProductQuantities(order);
        for (const line of [...order.lines]) {
            if (line.order_id) {
                order.removeOrderline(line);
            }
        }
        this.pos._applyOrderProductQuantityDelta(before, this.pos._getOrderProductQuantities(order));
    },
});


patch(OrderSummary.prototype, {
    decreaseQuantity(line) {
        const order = line?.order_id;
        if (!order || !line) {
            return;
        }
        const before = this.pos._getOrderProductQuantities(order);
        const quantity = line.get_quantity();
        const newQuantity = quantity > 0 ? Math.max(0, quantity - 1) : Math.min(0, quantity + 1);

        if (newQuantity === 0) {
            order.removeOrderline(line);
        } else {
            line.set_quantity(newQuantity, true);
        }
        this.pos._applyOrderProductQuantityDelta(
            before,
            this.pos._getOrderProductQuantities(order)
        );
    },
});
