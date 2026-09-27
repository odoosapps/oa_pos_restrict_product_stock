from odoo import api, models


class StockQuant(models.Model):
    """Notify open POS sessions when source-location stock changes."""

    _inherit = 'stock.quant'

    def _notify_pos_stock_change(self, product_ids, location_ids):
        if not product_ids or not location_ids:
            return

        configs = self.env['pos.config'].sudo().search([
            ('picking_type_id.default_location_src_id', 'child_of', list(location_ids)),
        ])
        for config in configs:
            if config.current_session_id:
                config._notify('OA_STOCK_UPDATE', {
                    'product_ids': list(product_ids),
                })

    @api.model_create_multi
    def create(self, vals_list):
        quants = super().create(vals_list)
        quants._notify_pos_stock_change(
            set(quants.mapped('product_id').ids),
            set(quants.mapped('location_id').ids),
        )
        return quants

    def write(self, vals):
        product_ids = set(self.mapped('product_id').ids)
        location_ids = set(self.mapped('location_id').ids)
        result = super().write(vals)
        product_ids.update(self.mapped('product_id').ids)
        location_ids.update(self.mapped('location_id').ids)
        self._notify_pos_stock_change(product_ids, location_ids)
        return result

    def unlink(self):
        product_ids = set(self.mapped('product_id').ids)
        location_ids = set(self.mapped('location_id').ids)
        result = super().unlink()
        self._notify_pos_stock_change(product_ids, location_ids)
        return result
