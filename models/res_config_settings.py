from odoo import fields, models


class ResConfigSettings(models.TransientModel):
    """Inherit res.config.settings to expose POS stock settings."""

    _inherit = 'res.config.settings'

    show_pos_stock = fields.Boolean(
        related="pos_config_id.show_pos_stock",
        string="Display Stock in POS",
        readonly=False,
        help="Enable to display live stock quantity on product tiles in POS."
    )
    restrict_out_of_stock = fields.Boolean(
        related="pos_config_id.restrict_out_of_stock",
        string="Restrict Out-of-Stock Products in POS",
        readonly=False,
        help="Enable to restrict or warn cashiers when adding out-of-stock items."
    )
    stock_check_type = fields.Selection(
        related="pos_config_id.stock_check_type",
        string="Stock Restriction Type",
        readonly=False,
        help="Quantity type to check and display for POS stock restrictions."
    )
