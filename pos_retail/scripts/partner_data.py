import xmlrpclib
import time
import logging

__logger = logging.getLogger(__name__)

start_time = time.time()

database = '15.big.datas'
login = 'admin'
password = 'admin'
url = 'http://localhost:8069'

common = xmlrpclib.ServerProxy('{}/xmlrpc/2/common'.format(url))
uid = common.authenticate(database, login, password, {})

models = xmlrpclib.ServerProxy(url + '/xmlrpc/object')

for i in range(0, 10000):
    vals = {
        'street': u'1 Paster, Ho Chi Minh',
        'city': u'Ho Chi Minh',
        'name': 'Partner_Sync_%s' % str(i),
        'zip': u'False',
        'mobile': u'0909999999',
        'country_id': 233,
        'email': u'customer_big_data@gmail.com',
    }
    partner_id = models.execute_kw(database, uid, password, 'res.partner', 'create', [vals])
    print i


