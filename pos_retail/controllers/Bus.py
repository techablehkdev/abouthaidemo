# -*- coding: utf-8 -*
from odoo.http import request
from odoo.addons.bus.controllers.main import BusController
from odoo import http, _
from datetime import datetime
import odoo

version_info = odoo.release.version_info[0]

datetime.strptime('2012-01-01', '%Y-%m-%d')

import logging

_logger = logging.getLogger(__name__)


class pos_bus(BusController):

    @http.route('/pos/update_order/status', type="json", auth="public")
    def bus_update_sale_order(self, status, order_name):
        sales = request.env["sale.order"].sudo().search([('name', '=', order_name)])
        sales.write({'sync_status': status})
        return 1

    @http.route('/pos/test/polling', type="json", auth="public")
    def test_polling(self, pos_id, messages):
        if request.env.user and request.env.user.partner_id:
            request.env['bus.bus']._sendone(
                request.env.user.partner_id, 'pos.test.polling', messages)
        return 1
