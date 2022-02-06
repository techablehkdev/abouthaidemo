# -*- coding: utf-8 -*-
from odoo import api, fields, models, tools, _, registry

import logging

_logger = logging.getLogger(__name__)


class PosApproveAction(models.Model):
    _name = 'pos.approve.action'
    _inherit = [
        'portal.mixin',
        'mail.thread',
        'mail.activity.mixin',
        'utm.mixin'
    ]

    name = fields.Char('Action', readonly=1)
    description = fields.Text('Description', readonly=1)
    request_uid = fields.Many2one('res.users', 'Request By', default=lambda self: self.env.user.id)
    request_time = fields.Datetime('Requested Time', default=lambda self: fields.Datetime.now())
    approve_uid = fields.Many2one('res.users', 'Approve by')
    approve_time = fields.Datetime('Approved Time')
    state = fields.Selection([
        ('waiting', 'Waiting'),
        ('approved', 'Approved'),
        ('cancelled', 'Cancelled')
    ], default='waiting', string='State')
    action_strId = fields.Char('Action ID', required=1, readonly=1)
    product_id = fields.Many2one('product.product', 'Product will Out of Stock')
    location_id = fields.Many2one('stock.location', 'Stock Location')
    type = fields.Selection([
        ('price_change', 'Price Change'),
        ('discount_change', 'Discount Change'),
        ('out_stock', 'Out of Stock')
    ], default='price_change', required=1, readonly=1)

    def create_from_ui(self, val):
        if val.get('action_strId'):
            oldRequest = self.search([
                ('action_strId', '=', val.get('action_strId')),
                ('type', '=', val.get('type')),
                ('state', '=', 'waiting')
            ], limit=1)
            if oldRequest:
                oldRequest.write(val)
                return oldRequest.id
            else:
                return self.create(val).id

    def check_from_ui(self, action_strId):
        oldRequest = self.search([
            ('action_strId', '=', action_strId),
        ], limit=1)
        if (oldRequest and oldRequest.state == 'approved') or not oldRequest:
            return True
        if oldRequest and oldRequest.state != 'approved':
            return False
        return True

    def actionApprove(self):
        return self.write({
            'state': 'approved',
            'approve_uid': self.env.user.id,
            'approve_time': fields.Datetime.now()
        })

    def actionCancel(self):
        return self.write({
            'state': 'cancelled',
        })

    def actionReset(self):
        return self.write({
            'state': 'waiting',
        })
