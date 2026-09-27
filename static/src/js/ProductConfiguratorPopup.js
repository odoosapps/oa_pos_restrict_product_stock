/** @odoo-module **/

import { patch } from "@web/core/utils/patch";
import { ProductConfiguratorPopup } from "@point_of_sale/app/store/product_configurator_popup/product_configurator_popup";
import { ConfirmationDialog } from "@web/core/confirmation_dialog/confirmation_dialog";
import { _t } from "@web/core/l10n/translation";

patch(ProductConfiguratorPopup.prototype, {
    async confirm() {
        const targetProduct = this.state?.product || this.props.product;
        const posConfig = this.pos.config;
        const dialogService = this.env.services.dialog;

        if (!targetProduct || !posConfig || !posConfig.restrict_out_of_stock) {
            return super.confirm(...arguments);
        }

        const availableQty = targetProduct.qty_available || 0;
        const virtualQty = targetProduct.virtual_available || 0;
        let isOutOfStock = false;

        switch (posConfig.stock_check_type) {
            case "on_hand":
                isOutOfStock = availableQty <= 0;
                break;
            case "forecast":
                isOutOfStock = virtualQty <= 0;
                break;
            case "both_qty":
                isOutOfStock = availableQty <= 0 || virtualQty <= 0;
                break;
        }

        if (isOutOfStock) {
            const userConfirmed = await new Promise((resolve) => {
                dialogService.add(ConfirmationDialog, {
                    title: _t("Out of Stock Warning"),
                    body: _t("%s is out of stock. Do you want to proceed?", targetProduct.display_name),
                    confirmLabel: _t("Order"),
                    cancelLabel: _t("Cancel"),
                    confirm: () => resolve(true),
                    cancel: () => resolve(false),
                });
            });

            if (!userConfirmed) {
                return;
            }
        }

        return super.confirm(...arguments);
    },
});
