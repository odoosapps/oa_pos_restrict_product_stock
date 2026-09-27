from odoo import fields, models


class PosConfig(models.Model):
    """Extend pos.config to store stock display and restriction configurations."""

    _inherit = 'pos.config'

    def write(self, vals):
        """Normalize an empty pricelist command sent by the settings form.

        Odoo 17's ``pos.config.write`` checks the first command for
        ``available_pricelist_ids`` before applying the normal x2many
        preprocessing. The settings form can send an empty list when all
        pricelists are cleared, which makes that core check raise
        ``IndexError``. An explicit ``(6, 0, [])`` has the same meaning and
        is safe for both the core check and the subsequent write.
        """
        if 'available_pricelist_ids' in vals and not vals['available_pricelist_ids']:
            vals = dict(vals)
            vals['available_pricelist_ids'] = [(6, 0, [])]
        return super().write(vals)

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
