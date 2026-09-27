/** @odoo-module **/

import { patch } from "@web/core/utils/patch";
import { ProductScreen } from "@point_of_sale/app/screens/product_screen/product_screen";
import { useService } from "@web/core/utils/hooks";
import { ConfirmationDialog } from "@web/core/confirmation_dialog/confirmation_dialog";
import { _t } from "@web/core/l10n/translation";

patch(ProductScreen.prototype, {
    setup() {
        super.setup();
        this.dialog = useService("dialog");
    },

    async addProductToOrder(...args) {
        const selectedProduct = args[0];
        const posConfig = this.pos.config;
        const checkType = posConfig.stock_check_type;

        if (selectedProduct && posConfig.restrict_out_of_stock && selectedProduct.type !== 'service' && !selectedProduct.to_weight) {
            const onHandDepleted = selectedProduct.qty_available <= 0;
            const forecastDepleted = selectedProduct.virtual_available <= 0;

            let isBlocked = false;
            if (checkType === 'on_hand' && onHandDepleted) {
                isBlocked = true;
            } else if (checkType === 'forecast' && forecastDepleted) {
                isBlocked = true;
            } else if (checkType === 'both_qty' && (onHandDepleted || forecastDepleted)) {
                isBlocked = true;
            }

            if (isBlocked) {
                this.dialog.add(ConfirmationDialog, {
                    title: _t("Out of Stock Warning"),
                    body: _t("%s is out of stock. Do you want to proceed?", selectedProduct.display_name),
                    confirmLabel: _t("Order"),
                    cancelLabel: _t("Cancel"),
                    confirm: () => {
                        selectedProduct.order_status = true;
                        super.addProductToOrder(...args);
                    },
                    cancel: () => {},
                });
                return;
            }
        }
        await super.addProductToOrder(...args);
    },
});
