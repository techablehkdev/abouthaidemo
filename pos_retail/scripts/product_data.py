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
        'list_price': i,
        'description': u'description',
        'name': 'Product_Sync_%s' % str(i),
        'pos_categ_id': 1,
        'to_weight': u'True',
        'available_in_pos': True,
    }
    product_id = models.execute_kw(database, uid, password, 'product.product', 'create', [vals])
    print i
