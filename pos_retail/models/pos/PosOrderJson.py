# -*- coding: utf-8 -*-
from odoo import api, fields, models, tools, _, registry

import logging
import json

_logger = logging.getLogger(__name__)


class PosOrderJson(models.Model):
    _name = "pos.order.json"
    _description = "Order Json"

    name = fields.Char(
        'Order Name',
        required=1,
        readonly=1
    )
    ean13 = fields.Char(
        'Ean13',
        required=1,
        readonly=1
    )
    session_id = fields.Many2one(
        'pos.session',
        'Session',
        required=1,
        readonly=1
    )
    uid = fields.Char('Receipt Number', required=1)
    json = fields.Text('Order Json', required=1)
    order_id = fields.Many2one('pos.order', 'Order')
    state = fields.Char(string='State', default='N/A')

    @api.model
    def create_from_ui(self, orders, draft=False):
        for o in orders:
            jsonExisting = self.search([('name', '=', o.get('name'))])
            if jsonExisting:
                continue
            else:
                log = self.create({
                    'name': o.get('name'),
                    'ean13': o.get('ean13'),
                    'uid': o.get('uid'),
                    'session_id': o.get('pos_session_id'),
                    'json': json.dumps(o)
                })
                _logger.info('new log %s' % log.id)
        return True

    @api.model
    def get_order(self, key):
        orders = self.search(['|', '|', ('ean13', '=', key), ('name', 'ilike', key), ('uid', 'ilike', key),], limit=1)
        if orders:
            return json.loads(orders[0].json)
        else:
            return False
