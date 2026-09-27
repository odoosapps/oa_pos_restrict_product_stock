from odoo import fields, models


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
