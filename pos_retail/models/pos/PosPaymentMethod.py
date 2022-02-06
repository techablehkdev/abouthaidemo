# -*- coding: utf-8 -*-
from odoo import api, fields, models, _


class PosPaymentMethod(models.Model):
    _inherit = "pos.payment.method"

    fullfill_amount = fields.Boolean(
        'Full fill Amount',
        help='If checked, when cashier click to this Payment Method \n'
             'Payment line auto full fill amount due'
    )

    shortcut_keyboard = fields.Char(
        string='Shortcut Keyboard',
        size=2,
        help='You can input a to z, F1 to F12, Do not set "b", because b is BACK SCREEN'
    )
    cheque_bank_information = fields.Boolean(
        'Cheque Bank Information',
        help='If checked, when cashier select this payment \n'
             'POS automatic popup ask cheque bank information \n'
             'And save information bank of customer to payment lines of Order'
    )
    discount = fields.Boolean('Apply Discount')
    discount_type = fields.Selection([
        ('percent', '%'),
        ('fixed', 'Fixed')
    ], string='Discount Type', default='percent')
    discount_amount = fields.Float('Discount Amount')
    discount_product_id = fields.Many2one(
        'product.product',
        string='Product Discount',
        domain=[('available_in_pos', '=', True)]
    )

    apply_charges = fields.Boolean("Apply Charges")
    fees_amount = fields.Float("Fees Amount")
    fees_type = fields.Selection(
        selection=[('fixed', 'Fixed'), ('percentage', 'Percentage')],
        string="Fees type",
        default="fixed")
    fees_product_id = fields.Many2one(
        'product.product',
        'Fees Product',
        domain=[('sale_ok', '=', True), ('available_in_pos', '=', True)]
    )
    optional = fields.Boolean("Optional")
    shortcut_key = fields.Char('Shortcut Key')
