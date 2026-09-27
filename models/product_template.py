import logging
from odoo import api, models

_logger = logging.getLogger(__name__)


class ProductTemplate(models.Model):
    """Extend product.template POS data loading to calculate location-scoped stock."""

    _inherit = 'product.template'

    @api.model
    def _load_pos_data_fields(self, config_id):
        """Include stock quantity fields in POS template loading."""
        field_list = super()._load_pos_data_fields(config_id)
        for req_field in ('qty_available', 'virtual_available'):
            if req_field not in field_list:
                field_list.append(req_field)
        return field_list

    @api.model
    def _load_pos_data_read(self, records, config):
        """Retrieve template location-specific quantities directly from stock.quant."""
        loaded_templates = super()._load_pos_data_read(records, config)

        src_loc = config.picking_type_id.default_location_src_id
        if not src_loc:
            _logger.warning(
                "oa_pos_restrict_product_stock: Missing source location for POS template '%s'.",
                config.name
            )
            return loaded_templates

        target_tmpl_ids = [item['id'] for item in loaded_templates if item.get('id')]
        if not target_tmpl_ids:
            return loaded_templates

        quant_records = list(self.env['stock.quant']._read_group(
            domain=[
                ('location_id', 'child_of', src_loc.id),
                ('product_tmpl_id', 'in', target_tmpl_ids),
            ],
            groupby=['product_tmpl_id'],
            aggregates=['quantity:sum', 'reserved_quantity:sum'],
        ))

        onhand_tmpl_map = {}
        forecast_tmpl_map = {}
        for tmpl_rec, on_hand, reserved in quant_records:
            t_id = tmpl_rec.id
            actual_qty = on_hand or 0.0
            res_qty = reserved or 0.0
            onhand_tmpl_map[t_id] = actual_qty
            forecast_tmpl_map[t_id] = actual_qty - res_qty

        for item in loaded_templates:
            tmpl_id = item.get('id')
            item['qty_available'] = onhand_tmpl_map.get(tmpl_id, 0.0)
            item['virtual_available'] = forecast_tmpl_map.get(tmpl_id, 0.0)

        return loaded_templates
