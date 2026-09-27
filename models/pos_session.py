from odoo import models


class PosSession(models.Model):
    """Load location-scoped stock values with the Odoo 17 POS data loader."""

    _inherit = "pos.session"

    def _loader_params_product_product(self):
        params = super()._loader_params_product_product()
        fields = params["search_params"]["fields"]
        if "type" not in fields:
            fields.append("type")
        return params

    def _get_pos_stock_quantities(self, product_ids):
        quantities = {
            product_id: {"qty_available": 0.0, "virtual_available": 0.0}
            for product_id in product_ids
        }
        location = self.config_id.picking_type_id.default_location_src_id
        if not location or not product_ids:
            return quantities

        groups = self.env["stock.quant"].sudo()._read_group(
            domain=[
                ("location_id", "child_of", location.id),
                ("product_id", "in", product_ids),
            ],
            groupby=["product_id"],
            aggregates=["quantity:sum", "reserved_quantity:sum"],
        )
        for product, quantity, reserved_quantity in groups:
            on_hand = quantity or 0.0
            reserved = reserved_quantity or 0.0
            quantities[product.id] = {
                "qty_available": on_hand,
                "virtual_available": on_hand - reserved,
            }
        return quantities

    def _process_pos_ui_product_product(self, products):
        super()._process_pos_ui_product_product(products)
        quantities = self._get_pos_stock_quantities([product["id"] for product in products])
        for product in products:
            values = quantities.get(product["id"], {})
            product["qty_available"] = values.get("qty_available", 0.0)
            product["virtual_available"] = values.get("virtual_available", 0.0)
