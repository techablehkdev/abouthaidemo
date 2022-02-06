# -*- coding: utf-8 -*-
from odoo import fields, models, api, _
from odoo.exceptions import UserError
import logging

_logger = logging.getLogger(__name__)


class PosMergeOrder(models.TransientModel):
    _name = "pos.merge.order"
    _description = "POS Merge Orders"

    def mergeOrders(self):
        _logger.info('BEGIN mergeOrders')
        user = self.env.user
        order_obj = self.env['pos.order']
        orders = self.env['pos.order'].browse(self.env.context.get('active_ids', []))
        _logger.info('merger orders %s' % orders)
        if len(orders) <= 1:
            raise UserError(_('Required Minimum 2 orders for merge'))
        for o in orders:
            if o.state in ['paid', 'done', 'invoiced']:
                raise UserError(_('Required Orders selected not Paid, Done or Invoiced'))
        firstOrder = orders[0]
        for o in orders:
            if o.id == firstOrder.id:
                continue
            else:
                for l in o.lines:
                    l.write({'order_id': firstOrder.id})
                    l.write({'last_order_id': o.id})
                for p in o.payment_ids:
                    p.write({'order_id': firstOrder.id})
                    p.write({'last_order_id': o.id})
                o.write({'state': 'cancel'})
                o._onchange_amount_all()
        firstOrder._onchange_amount_all()
        return True
