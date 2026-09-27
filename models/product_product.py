from odoo import api, models



class ProductProduct(models.Model):
    """Extend product.product POS data loading to calculate location-scoped stock."""

    _inherit = 'product.product'

    @api.model
    def _get_pos_stock_quantities(self, product_ids, config):
        """Return stock quantities for products in the POS source location."""
        product_ids = {int(product_id) for product_id in (product_ids or []) if product_id}
        quantities = {
            product_id: {
                'qty_available': 0.0,
                'virtual_available': 0.0,
            }
            for product_id in product_ids
        }

        src_loc = config.picking_type_id.default_location_src_id
        if not src_loc or not product_ids:
            return quantities

        quant_records = self.env['stock.quant'].sudo()._read_group(
            domain=[
                ('location_id', 'child_of', src_loc.id),
                ('product_id', 'in', list(product_ids)),
            ],
            groupby=['product_id'],
            aggregates=['quantity:sum', 'reserved_quantity:sum'],
        )
        for product, quantity, reserved_quantity in quant_records:
            on_hand = quantity or 0.0
            reserved = reserved_quantity or 0.0
            quantities[product.id] = {
                'qty_available': on_hand,
                'virtual_available': on_hand - reserved,
            }
        return quantities

    @api.model
    def get_pos_stock_quantities(self, product_ids, config_id):
        """Read current POS stock for already loaded products.

        This is called by the POS after an order is synchronized and while
        the session is open so inventory changes made in the backend appear
        without reloading the POS page.
        """
        config = self.env['pos.config'].browse(config_id).exists()
        if not config:
            return {}
        config.ensure_one()
        quantities = self._get_pos_stock_quantities(product_ids, config)
        return {str(product_id): values for product_id, values in quantities.items()}
