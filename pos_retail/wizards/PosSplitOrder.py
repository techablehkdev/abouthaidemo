# -*- coding: utf-8 -*-
from odoo import fields, models, api, _
from odoo.exceptions import UserError
import logging

_logger = logging.getLogger(__name__)


class PosSplitOrder(models.TransientModel):
    _name = "pos.split.order"
    _description = "POS Split Orders"

    order_id = fields.Many2one('pos.order', 'Order', required=1)
    lines = fields.Many2many(
        'pos.order.line',
        'pos_split_order_pos_order_line_rel',
        'wiz_id',
        'pos_order_line_id',
        'Lines Will Split', help='Please Remove Lines do not merge')

    @api.model
    def default_get(self, default_fields):
        res = super(PosSplitOrder, self).default_get(default_fields)
        order = self.env['pos.order'].browse(self.env.context.get('active_id', []))
        res.update({
            'order_id': order.id,
            'lines': [(6, 0, [l.id for l in order.lines])]
        })
        return res

    def splitOrders(self):
        for wiz in self:
            if wiz.order_id.state in ['paid', 'done', 'invoiced']:
                raise UserError(_('Required Orders selected not Paid, Done or Invoiced'))
            newOrder = wiz.order_id.copy()
            newOrder.lines.unlink()
            for l in wiz.lines:
                l.write({
                    'order_id': newOrder.id,
                    'last_order_id': wiz.order_id.id
                })
            newOrder._onchange_amount_all()
            wiz.order_id._onchange_amount_all()
            return {
                'name': _("Order New"),
                'type': 'ir.actions.act_window',
                'view_type': 'form',
                'view_mode': 'form',
                'res_model': 'pos.order',
                'res_id': newOrder.id,
                'target': 'current',
            }
