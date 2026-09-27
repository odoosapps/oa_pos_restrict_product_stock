from odoo import api, models



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
    def _load_pos_data(self, data):
        """Load templates with quantities from the POS source location."""
        response = super()._load_pos_data(data)
        config = self.env['pos.config'].browse(data['pos.config']['data'][0]['id'])
        src_loc = config.picking_type_id.default_location_src_id
        quantities = {}
        if src_loc and response['data']:
            quant_records = self.env['stock.quant']._read_group(
                domain=[
                    ('location_id', 'child_of', src_loc.id),
                    ('product_tmpl_id', 'in', [item['id'] for item in response['data']]),
                ],
                groupby=['product_tmpl_id'],
                aggregates=['quantity:sum', 'reserved_quantity:sum'],
            )
            quantities = {
                template.id: {
                    'qty_available': on_hand or 0.0,
                    'virtual_available': (on_hand or 0.0) - (reserved or 0.0),
                }
                for template, on_hand, reserved in quant_records
            }
        for template in response['data']:
            values = quantities.get(template.get('id'), {})
            template['qty_available'] = values.get('qty_available', 0.0)
            template['virtual_available'] = values.get('virtual_available', 0.0)
        return response
