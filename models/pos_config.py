from odoo import api, fields, models


class PosConfig(models.Model):
    """Extend pos.config to store stock display and restriction configurations."""

    _inherit = 'pos.config'

    show_pos_stock = fields.Boolean(
        string="Display Stock in POS",
        default=True,
        help="Enable to display live stock quantity on product tiles in POS."
    )
    restrict_out_of_stock = fields.Boolean(
        string="Restrict Out-of-Stock Products in POS",
        default=True,
        help="Enable to restrict or warn cashiers when adding out-of-stock items."
    )
    stock_check_type = fields.Selection(
        selection=[
            ('on_hand', 'Qty on Hand'),
            ('forecast', 'Virtual Qty'),
            ('both_qty', 'Both')
        ],
        required=True,
        default='on_hand',
        string="Stock Restriction Type",
        help="Quantity type to check and display for POS stock restrictions."
    )

    _POS_DATA_FIELDS = (
        'id', 'name', 'display_name', 'company_id', 'currency_id',
        'use_pricelist', 'pricelist_id', 'available_pricelist_ids',
        'payment_method_ids', 'iface_available_categ_ids',
        'fiscal_position_ids', 'default_fiscal_position_id',
        'default_preset_id', 'use_presets', 'basic_receipt',
        'cash_control', 'cash_rounding', 'only_round_cash_method',
        'rounding_method', 'module_pos_restaurant', 'module_pos_discount',
        'module_pos_hr', 'manual_discount', 'other_devices',
        'epson_printer_ip', 'printer_ids', 'receipt_printer_ids', 'preparation_printer_ids', 'tip_product_id',
        'show_product_images', 'show_category_images',
        'iface_cashdrawer', 'iface_electronic_scale',
        'iface_print_via_proxy', 'iface_scan_via_proxy',
        'iface_big_scrollbars', 'iface_group_by_categ',
        'iface_print_auto', 'iface_print_skip_screen', 'iface_tax_included',
        'restrict_price_control', 'is_margins_costs_accessible_to_every_user',
        'receipt_header', 'receipt_footer', 'proxy_ip', 'is_posbox',
        'auto_validate_terminal_payment', 'fast_payment_method_ids',
        'use_fast_payment', 'access_token', 'trusted_config_ids',
        'route_id', 'picking_policy', 'ship_later', 'warehouse_id',
        'discount_product_id', 'iface_customer_facing_display_via_proxy',
    )

    @api.model
    def _load_pos_data_fields(self, config):
        fields = list(super()._load_pos_data_fields(config))
        for field_name in self._POS_DATA_FIELDS + (
            'show_pos_stock', 'restrict_out_of_stock', 'stock_check_type',
        ):
            if field_name in self._fields and field_name not in fields:
                fields.append(field_name)
        return fields
