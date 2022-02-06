# -*- coding: utf-8 -*-
from odoo import api, models, fields, registry
import json
import ast
from odoo.tools import DEFAULT_SERVER_DATETIME_FORMAT

from datetime import datetime, timedelta
import logging

_logger = logging.getLogger(__name__)


class PosCacheDatabase(models.Model):
    _name = "pos.cache.database"
    _description = "Management POS database"
    _rec_name = "res_id"
    _order = 'res_model'

    res_id = fields.Char('Id')
    res_model = fields.Char('Model')
    deleted = fields.Boolean('Deleted', default=0)

    def request_pos_sessions_online_reload_by_channel(self, channel):
        sessions = self.env['pos.session'].sudo().search([
            ('state', '=', 'opened')
        ])
        for session in sessions:
            self.env['bus.bus']._sendone(
                session.user_id.partner_id, channel, {})
        return True

    def get_modifiers_backend(self, write_date, res_model, config_id=None):
        to_date = datetime.strptime(write_date, DEFAULT_SERVER_DATETIME_FORMAT) + timedelta(
            seconds=1)
        to_date = to_date.strftime(DEFAULT_SERVER_DATETIME_FORMAT)
        results = []
        domain = [('write_date', '>', to_date)]
        if config_id:
            domain.append(('config_id', '=', config_id))
        records = self.env[res_model].sudo().search([('write_date', '>', to_date)], limit=1000)
        for record in records:
            value = {
                'model': res_model,
                'id': record.id,
                'write_date': record.write_date,
                'deleted': False
            }
            val = self.get_data(res_model, record.id)
            if not val \
                    or (res_model == 'product.product' and (
                    val.get('sale_ok', None) != True or val.get('available_in_pos', None) != True or val.get('active',
                                                                                                             None) != True)) \
                    or (res_model == 'res.partner' and val.get('active', None) != True):
                value['deleted'] = True
            else:
                value.update(val)
            results.append(value)
        return results

    def get_fields_by_model(self, model_name):
        params = self.env['ir.config_parameter'].sudo().get_param(model_name)
        if not params:
            list_fields = self.env[model_name].sudo().fields_get()
            fields_load = []
            for k, v in list_fields.items():
                if v['type'] not in ['binary']:
                    fields_load.append(k)
            return fields_load
        else:
            params = ast.literal_eval(params)
            return params.get('fields', [])

    def get_domain_by_model(self, model_name):
        params = self.env['ir.config_parameter'].sudo().get_param(model_name)
        if not params:
            return []
        else:
            params = ast.literal_eval(params)
            return params.get('domain', [])

    def install_data(self, model_name=None, min_id=0, max_id=1999):
        self.env.cr.execute(
            "select id, call_results from pos_call_log where min_id=%s and max_id=%s and call_model='%s'" % (
                min_id, max_id, model_name))
        old_logs = self.env.cr.fetchall()
        datas = []
        if len(old_logs) == 0:
            datas = self.installing_datas(model_name, min_id, max_id)
        else:
            datas = old_logs[0][1]
        return datas

    def installing_datas(self, model_name, min_id, max_id):
        cache_obj = self.sudo()
        log_obj = self.env['pos.call.log'].sudo()
        domain = [('id', '>=', min_id), ('id', '<=', max_id)]
        if model_name == 'product.product':
            domain.append(('available_in_pos', '=', True))
            domain.append(('sale_ok', '=', True))
        field_list = cache_obj.get_fields_by_model(model_name)
        datas = self.env[model_name].sudo().search_read(domain, field_list)
        datas = log_obj.covert_datetime(model_name, datas)
        vals = {
            'active': True,
            'min_id': min_id,
            'max_id': max_id,
            'call_fields': json.dumps(field_list),
            'call_results': json.dumps(datas),
            'call_model': model_name,
            'call_domain': json.dumps(domain),
        }
        logs = log_obj.search([
            ('min_id', '=', min_id),
            ('max_id', '=', max_id),
            ('call_model', '=', model_name),
        ])
        if logs:
            logs.write(vals)
        else:
            log_obj.create(vals)
        self.env.cr.commit()
        cache_obj = self.sudo()
        log_obj = self.env['pos.call.log'].sudo()
        domain = [('id', '>=', min_id), ('id', '<=', max_id)]
        if model_name == 'product.product':
            domain.append(('available_in_pos', '=', True))
            domain.append(('sale_ok', '=', True))
        field_list = cache_obj.get_fields_by_model(model_name)
        datas = self.env[model_name].sudo().search_read(domain, field_list)
        datas = log_obj.covert_datetime(model_name, datas)
        vals = {
            'active': True,
            'min_id': min_id,
            'max_id': max_id,
            'call_fields': json.dumps(field_list),
            'call_results': json.dumps(datas),
            'call_model': model_name,
            'call_domain': json.dumps(domain),
        }
        logs = log_obj.search([
            ('min_id', '=', min_id),
            ('max_id', '=', max_id),
            ('call_model', '=', model_name),
        ])
        if logs:
            logs.write(vals)
        else:
            log_obj.create(vals)
        self.env.cr.commit()
        return datas

    def insert_data(self, model, record_id):
        if type(model) == list:
            return False
        last_caches = self.search([('res_id', '=', str(record_id)), ('res_model', '=', model)], limit=1)
        if last_caches:
            last_caches.write({
                'res_model': model,
                'deleted': False
            })
        else:
            self.create({
                'res_id': str(record_id),
                'res_model': model,
                'deleted': False
            })
        return True

    def get_data(self, model, record_id):
        data = {
            'model': model
        }
        fields_read_load = self.sudo().get_fields_by_model(model)
        if model in ['res.partner', 'product.product']:
            fields_read_load.append('active')
        if model == 'product.product':
            fields_read_load.append('sale_ok')
        vals = self.env[model].sudo().search_read([('id', '=', record_id)], fields_read_load)
        if vals:
            data.update(vals[0])
            return data
        else:
            return None

    def remove_record(self, model, record_id):
        records = self.sudo().search([('res_id', '=', str(record_id)), ('res_model', '=', model)])
        if records:
            records.write({
                'deleted': True,
            })
        else:
            vals = {
                'res_id': str(record_id),
                'res_model': model,
                'deleted': True,
            }
            self.create(vals)
        return True

    def save_parameter_models_load(self, model_datas):
        for model_name, value in model_datas.items():
            self.env['ir.config_parameter'].sudo().set_param(model_name, value)
        return True
