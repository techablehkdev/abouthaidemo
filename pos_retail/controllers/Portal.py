# -*- coding: utf-8 -*
from odoo.http import request
import json
from odoo import http, _
from odoo.addons.web.controllers.main import ensure_db, Home, Session, WebClient

import logging

_logger = logging.getLogger(__name__)


class web_login(Home):

    @http.route(['/point_of_sale/potal'], type='http', auth='user')
    def loginToBranch(self, **k):
        action = request.env.ref('pos_retail.point_of_sale_portal')
        return http.local_redirect('/web#action=%s' % (action.id))