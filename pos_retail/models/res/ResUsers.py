# -*- coding: utf-8 -*-
from odoo import api, fields, models, tools, _
from odoo.exceptions import UserError
import hashlib


class res_users(models.Model):
    _inherit = "res.users"

    pos_config_id = fields.Many2one(
        'pos.config',
        'Main Point Of Sale',
        help='If you set pos profile here \n'
             'When this user login to odoo, automatic login direct to POS'
    )
    pos_config_ids = fields.Many2many(
        'pos.config',
        'res_users_pos_config_rel',
        'user_id',
        'config_id',
        string='Access to Point Of Sale',
        help='If you add Point Of Sale here \n'
             'User will only see only POS(s) here'
    )
    pos_delete_order = fields.Boolean(
        'Delete POS Orders',
        default=0)
    pos_security_pin = fields.Integer(
        string='POS Security PIN',
        help='A Security PIN used to protect sensible functionality in the Point of Sale')
    pos_branch_id = fields.Many2one(
        'pos.branch',
        string='POS Branch Assigned',
        help='This is branch default for any records data create by this user'
    )
    pos_portal_user = fields.Boolean(
        'POS User Portal',
        default=0,
        help='If you active it \n'
             'When POS User login, auto direct to Portal Page, without Backend Page \n'
             'User only access POS Name of [Access to Point Of Sale]'
    )

    allow_access_backend = fields.Boolean(
        'Allow Access Backend',
        default=1
    )

    def get_barcodes_and_pin_hashed(self):
        users = self.search([('id', 'in', self.ids)])
        users_data = self.sudo().search_read([('id', 'in', users.ids)], ['barcode'])
        for u in users_data:
            u['barcode'] = hashlib.sha1(u['barcode'].encode('utf8')).hexdigest() if u['barcode'] else False
        return users_data
