odoo.define('pos_retail.big_data', function (require) {

    const models = require('point_of_sale.models');
    const core = require('web.core');
    const _t = core._t;
    const db = require('point_of_sale.DB');
    const indexed_db = require('pos_retail.indexedDB');
    const field_utils = require('web.field_utils');
    const time = require('web.time');
    const retail_db = require('pos_retail.database');
    const bus = require('pos_retail.core_bus');
    const rpc = require('web.rpc');
    const exports = {};
    const {posbus} = require('point_of_sale.utils');
    const Session = require('web.Session');
    const {Gui} = require('point_of_sale.Gui');
    const {isConnectionError} = require('point_of_sale.utils');

    const indexedDB = window.indexedDB || window.mozIndexedDB || window.webkitIndexedDB || window.msIndexedDB || window.shimIndexedDB;

    if (!indexedDB) {
        window.alert("Your browser doesn't support a stable version of IndexedDB.")
    }

    // TODO: for QRcodeOrderScreen
    const listenEventConfirmPlaceOrderOfUsers = Backbone.Model.extend({
        initialize: function (pos) {
            var self = this;
            this.pos = pos;
        },
        start: function () {
            this.bus = bus.bus;
            this.bus.on("notification", this, this.on_notification);
            this.bus.start_polling();
        },
        on_notification: function (notifications) {
            if (notifications && notifications[0] && notifications[0][1]) {
                console.warn('!!! event on_notification()')
                const type = notifications[0][1]['type']
                const payload = notifications[0][1]['payload']
                console.log(type)
                console.log(payload)
            }
            // if (notifications && notifications[0] && notifications[0][1]) {
            //     for (var i = 0; i < notifications.length; i++) {
            //         var channel = notifications[i][0][1];
            //         if (channel == 'pos.confirm.place.order') {
            //             let uid = notifications[i][1].uid
            //             posbus.trigger('user-confirm-place-order', uid)
            //         }
            //     }
            // }
        }
    });

    const _super_PosModel = models.PosModel.prototype;
    models.PosModel = models.PosModel.extend({
        initialize: async function (session, attributes) {
            if (attributes && attributes.chrome) {
                this.chrome = attributes.chrome
            }
            this.deleted = {}
            this.partner_model = null
            this.product_model = null
            this.total_products = 0
            this.total_clients = 0
            this.max_load = 9999
            this.next_load = 10000
            this.first_load = 10000
            this.product_ids = []
            this.partner_ids = []
            this.session = session.env.session
            this.sequence = 0
            this.model_ids = this.session['model_ids']
            this.start_time = this.session['start_time']
            this.company_currency_id = this.session['company_currency_id']
            _super_PosModel.initialize.call(this, session, attributes);
            for (let modelName in this.model_ids) {
                let modelObj = this.model_ids[modelName]
                if (modelName == 'product.product') {
                    const productModel = this.models.find(m => m.label == 'load_products')
                    productModel['min_id'] = modelObj['min_id']
                    productModel['max_id'] = modelObj['max_id']
                    this.product_model = productModel
                } else {
                    const partnerModel = this.models.find(m => m.label == 'load_partners')
                    partnerModel['min_id'] = modelObj['min_id']
                    partnerModel['max_id'] = modelObj['max_id']
                    this.partner_model = partnerModel
                }
            }
            if (this.product_model && this.partner_model) {
                let models = {
                    'product.product': {
                        fields: this.product_model.fields,
                        domain: this.product_model.domain,
                        context: this.product_model.context,
                    },
                    'res.partner': {
                        fields: this.partner_model.fields,
                        domain: this.partner_model.domain,
                        context: this.partner_model.context,
                    }
                }
                this.rpc({
                    model: 'pos.cache.database',
                    method: 'save_parameter_models_load',
                    args: [[], models]
                })
            }
            let pos_session_object = this.get_model('pos.session');
            if (pos_session_object) {
                pos_session_object.fields.push('required_reinstall_cache')
            }
            if (this.session.model_ids['product.product']['count'] > 1000 || this.session.model_ids['res.partner']['count'] > 1000) {
                this.models = this.models.filter(m => m.label != 'load_products' && m.label != 'load_partners')
            }
            this.indexed_db = new indexed_db(odoo.session_info)
        },

        async getDatasByModel(model, domain, fields, context) {
            const self = this
            const object = this.get_model(model);
            if (!fields) {
                fields = object.fields
            }
            if (!domain) {
                domain = object.domain
            }
            if (!context) {
                context = object.context
            }
            domain = typeof domain === 'function' ? domain(this, {}) : domain;
            fields = typeof fields === 'function' ? fields(this, {}) : fields;
            context = typeof context === 'function' ? context(this, {}) : context;
            if (!context) {
                context = {}
            }
            if (!fields) {
                fields = []
            }
            if (!domain) {
                domain = []
            }
            if (this.pos_session) {
                context['session_id'] = this.pos_session.id
                context['config_id'] = this.pos_session.config_id[0]
            }
            this.set_synch('connecting', '')
            try {
                let datas = await this.rpc({
                    model: model,
                    method: 'search_read',
                    domain: domain,
                    fields: fields,
                    context: context,
                })
                this.set_synch('connected', '')
                return datas
            } catch (error) {
                this.set_synch('disconnected', _t('Odoo Offline'))
                return []
            }
        },

        async getAccountMoves() {
            const model = this.get_model('account.move');
            this.saveMoves(await this.getDatasByModel(model['model'], model['domain'], model['fields'], model['context']))
            this.db.save_invoice_lines(await this.getAccountMoveLines())
            posbus.trigger('reload-account-move')
        },

        async getAccountMoveLines() {
            const model = this.get_model('account.move.line');
            return await this.getDatasByModel(model['model'], model['domain'], model['fields'], model['context'])
        },

        saveMoves(invoices) {
            this.invoice_ids = []
            for (let i = 0; i < invoices.length; i++) {
                invoice = invoices[i]
                this.invoice_ids.push(invoice['id']);
                if (invoice.partner_id) {
                    invoice.partner_name = invoice.partner_id[1]
                }
                if (invoice.invoice_user_id) {
                    invoice.user_name = invoice.invoice_user_id[1]
                }
            }
            this.db.save_invoices(invoices);
        },

        async getSaleOrders() {
            const model = this.get_model('sale.order');
            this.saveSaleOrders(await this.getDatasByModel(model['model'], model['domain'], model['fields'], model['context']))
            await this.getSaleOrderLines()
            posbus.trigger('reload-sale-orders')
        },

        async getSaleOrderLines() {
            const model = this.get_model('sale.order.line');
            this.saveSaleOrderLines(await this.getDatasByModel(model['model'], model['domain'], model['fields'], model['context']))
        },

        saveSaleOrders(orders) {
            if (!this.booking_ids) {
                this.booking_ids = [];
            }
            for (let i = 0; i < orders.length; i++) {
                let order = orders[i]
                if (!this.booking_ids.includes(order.id)) {
                    this.booking_ids.push(order.id)
                }
                let create_date = field_utils.parse.datetime(order.create_date);
                order.create_date = field_utils.format.datetime(create_date);
                let date_order = field_utils.parse.datetime(order.date_order);
                order.date_order = field_utils.format.datetime(date_order);
                if (order.reserve_from) {
                    let reserve_from = field_utils.parse.datetime(order.reserve_from);
                    order.reserve_from = field_utils.format.datetime(reserve_from);
                }
                if (order.reserve_to) {
                    let reserve_to = field_utils.parse.datetime(order.reserve_to);
                    order.reserve_to = field_utils.format.datetime(reserve_to);
                }
                if (order.partner_id) {
                    order.partner_name = order.partner_id[1]
                }
                if (order.user_id) {
                    order.user_name = order.user_id[1]
                }
            }
            this.db.save_sale_orders(orders);
        },

        saveSaleOrderLines(order_lines) {
            if (!this.order_lines) {
                this.order_lines = order_lines;
            } else {
                this.order_lines = this.order_lines.concat(order_lines);
                order_lines.forEach(l => {
                    this.order_lines = this.order_lines.filter(sol => sol.id != l.id)
                    this.order_lines.push(l)
                })
            }
            this.db.save_sale_order_lines(order_lines);
        },

        async getPosOrders() {
            const model = this.get_model('pos.order');
            this.savePosOrders(await this.getDatasByModel(model['model'], model['domain'], model['fields'], model['context']))
            await this.getPosOrderLines()
            await this.getPosPayments()
            await this.getPosPackOperationLot()
        },

        async getPosOrderLines() {
            const model = this.get_model('pos.order.line');
            this.savePosOrderLines(await this.getDatasByModel(model['model'], model['domain'], model['fields'], model['context']))
        },

        async getPosPayments() {
            const model = this.get_model('pos.payment');
            let payments = await this.getDatasByModel(model['model'], model['domain'], model['fields'], model['context'])
            this.savePosPaymentLines(payments)
            return payments
        },

        async getPosPackOperationLot() {
            const model = this.get_model('pos.pack.operation.lot');
            let packs = await this.getDatasByModel(model['model'], model['domain'], model['fields'], model['context'])
            this.savePackOperationLot(packs)
            return packs
        },

        savePosPaymentLines(payments) {
            for (let i = 0; i < payments.length; i++) {
                let payment = payments[i]
                let payment_date = field_utils.parse.datetime(payment.payment_date);
                payment.payment_date = field_utils.format.datetime(payment_date);
                let order_id = payment.pos_order_id[0]
                let order = this.db.order_by_id[order_id]
                order['payments'].push(payment)
            }
        },

        savePosOrders(orders) {
            this.order_ids = [];
            for (let i = 0; i < orders.length; i++) {
                let order = orders[i];
                let create_date = field_utils.parse.datetime(order.create_date);
                order.create_date = field_utils.format.datetime(create_date);
                let date_order = field_utils.parse.datetime(order.date_order);
                order.date_order = field_utils.format.datetime(date_order);
                this.order_ids.push(order.id)
                if (order.partner_id) {
                    order.partner_name = order.partner_id[1]
                }
                if (order.user_id) {
                    order.user_name = order.user_id[1]
                }
            }
            this.db.save_pos_orders(orders);
            posbus.trigger('reload-pos-orders')
        },

        savePosOrderLines(order_lines) {
            this.orderline_ids = []
            this.db.save_pos_order_line(order_lines);
            for (let i = 0; i < order_lines.length; i++) {
                this.orderline_ids.push(order_lines[i]['id'])
            }
        },

        savePackOperationLot(pack_operation_lots) {
            this.pack_operation_lots = pack_operation_lots;
            this.pack_operation_lots_by_pos_order_line_id = {};
            for (let i = 0; i < pack_operation_lots.length; i++) {
                let pack_operation_lot = pack_operation_lots[i];
                if (!pack_operation_lot.pos_order_line_id) {
                    continue
                }
                if (!this.pack_operation_lots_by_pos_order_line_id[pack_operation_lot.pos_order_line_id[0]]) {
                    this.pack_operation_lots_by_pos_order_line_id[pack_operation_lot.pos_order_line_id[0]] = [pack_operation_lot]
                } else {
                    this.pack_operation_lots_by_pos_order_line_id[pack_operation_lot.pos_order_line_id[0]].push(pack_operation_lot)
                }
            }
        },

        removeProductHasDeletedOutOfCart: function (product_id) {
            let orders = this.get('orders').models;
            for (let n = 0; n < orders.length; n++) {
                let order = orders[n];
                for (let i = 0; i < order.orderlines.models.length; i++) {
                    let line = order.orderlines.models[i];
                    if (line.product.id == product_id) {
                        order.remove_orderline(line);
                    }
                }
            }
        },
        update_customer_in_cart: function (partner_datas) {
            this.the_first_load = true;
            let orders = this.get('orders').models;
            for (let i = 0; i < orders.length; i++) {
                let order = orders[i];
                let client_order = order.get_client();
                if (!client_order || order.finalized) {
                    continue
                }
                for (let n = 0; n < partner_datas.length; n++) {
                    let partner_data = partner_datas[n];
                    if (partner_data['id'] == client_order.id) {
                        let client = this.db.get_partner_by_id(client_order.id);
                        order.set_client(client);
                    }
                }
            }
            this.the_first_load = false;
        },
        remove_partner_deleted_outof_orders: function (partner_id) {
            let orders = this.get('orders').models;
            let order = orders.find(function (order) {
                let client = order.get_client();
                if (client && client['id'] == partner_id) {
                    return true;
                }
            })
            if (order) {
                order.set_client(null)
            }
            return order;
        },
        get_model: function (_name) {
            let _index = this.models.map(function (e) {
                return e.model;
            }).indexOf(_name);
            if (_index > -1) {
                return this.models[_index];
            }
            return false;
        },
        sort_by: function (field, reverse, primer) {
            let key = primer ?
                function (x) {
                    return primer(x[field])
                } :
                function (x) {
                    return x[field]
                };
            reverse = !reverse ? 1 : -1;
            return function (a, b) {
                return a = key(a), b = key(b), reverse * ((a > b) - (b > a));
            }
        },

        _get_active_pricelist: function () {
            let current_order = this.get_order();
            let default_pricelist = this.default_pricelist;
            if (current_order && current_order.pricelist) {
                let pricelist = _.find(this.pricelists, function (pricelist_check) {
                    return pricelist_check['id'] == current_order.pricelist['id']
                });
                return pricelist;
            } else {
                if (default_pricelist) {
                    let pricelist = _.find(this.pricelists, function (pricelist_check) {
                        return pricelist_check['id'] == default_pricelist['id']
                    });
                    return pricelist
                } else {
                    return null
                }
            }
        },

        get_process_time: function (min, max) {
            if (min > max) {
                return 1
            } else {
                return (min / max).toFixed(1)
            }
        },

        // async getImageProducts() {
        //     // TODO: loading product images for render product image on product screen
        //     const self = this
        //     const datas = await PosIDB.get('productImages')
        //     if (!datas || datas.length == 0) {
        //         return await this.getDatasByModel('product.product', [['id', 'in', this.db.product_ids]], ['image_128']).then(function (datas) {
        //             if (!datas) {
        //                 return false
        //             }
        //             console.log('LOADED from POSIDB Image of Products: ' + datas.length)
        //             for (let i = 0; i < datas.length; i++) {
        //                 let data = datas[i]
        //                 self.image_by_product_id[data['id']] = data['image_128']
        //             }
        //             posbus.trigger('reload-products-screen')
        //             PosIDB.set('productImages', datas)
        //         })
        //     } else {
        //         console.log('LOADED from BACKEND Image of Products: ' + datas.length)
        //         for (let i = 0; i < datas.length; i++) {
        //             let data = datas[i]
        //             self.image_by_product_id[data['id']] = data['image_128']
        //         }
        //         console.log('Render Imgages of Products')
        //         posbus.trigger('reload-products-screen')
        //     }
        // },

        async getProductPricelistItems() {
            // TODO: loading product pricelist items on background
            const self = this;
            await this.getDatasByModel('product.pricelist.item', [['pricelist_id', 'in', _.pluck(this.pricelists, 'id')]], []).then(function (pricelistItems) {
                if (!pricelistItems) {
                    return false
                }
                console.log('[loaded] Product Pricelist Items: ' + pricelistItems.length)
                const pricelist_by_id = {};
                _.each(self.pricelists, function (pricelist) {
                    pricelist_by_id[pricelist.id] = pricelist;
                });
                _.each(pricelistItems, function (item) {
                    let pricelist = pricelist_by_id[item.pricelist_id[0]];
                    pricelist.items.push(item);
                    item.base_pricelist = pricelist_by_id[item.base_pricelist_id[0]];
                });
                let order = self.get_order();
                let pricelist = self._get_active_pricelist();
                if (order && pricelist) {
                    order.set_pricelist(pricelist);
                }
            })
        },

        reloadPosScreen() {
            const self = this;
            return new Promise(function (resolve, reject) {
                self.rpc({
                    model: 'pos.session',
                    method: 'update_required_reinstall_cache',
                    args: [[self.pos_session.id]]
                }, {
                    shadow: true,
                    timeout: 65000
                }).then(function (state) {
                    self.remove_indexed_db();
                    self.reload_pos();
                    resolve(state);
                }, function (err) {
                    self.remove_indexed_db();
                    self.reload_pos();
                    reject(err)
                })
            });
        },

        async getStockDatasByLocationIds(product_ids = [], location_ids = []) {
            let stock = {}
            try {
                stock = await this.rpc({
                    model: 'stock.location',
                    method: 'getStockDatasByLocationIds',
                    args: [[], product_ids, location_ids],
                    context: {}
                })
                return stock
            } catch (e) {
                console.warn('Odoo Server offline or Internet have problem')
                return stock
            }

        },

        async _loadProductsFromOffsetDomain(domain, offset) {
            let ProductIds = [];
            ProductIds = await this.rpc({
                model: 'product.product',
                method: 'search',
                args: [domain],
                kwargs: {
                    offset: 100 * offset,
                    limit: 100,
                    order: 'write_date'
                },
                context: this.env.session.user_context,
            });
            return ProductIds;
        },

        async _syncProducts() {
            if (this.networkCrashed) {
                return false
            }
            const domain = [['write_date', '>', this.db.write_date_by_model['product.product']]]
            let offset = 0
            let activeIds = []
            do {
                activeIds = await this._loadProductsFromOffsetDomain(domain, offset)
                if (activeIds.length > 0) {
                    let datas = await this.getDatasByModel('product.product', [['id', 'in', activeIds]], null, {})
                    if (datas.length) {
                        this.update_indexDB('product.product', datas)
                    }
                }
                offset += 1
                console.warn('sync products with offset: ' + offset)
            } while (activeIds.length);
            let datas = await this.getDatasByModel('pos.cache.database', [['deleted', '=', true], ['res_model', '=', 'product.product']])
            if (datas.length) {
                console.warn('_syncProducts: STARTING REMOVES TOTAL PRODUCTS: ' + datas.length)
                this.remove_indexDB('product.product', datas)
            }
            return true
        },

        async _loadPartnersFromOffsetDomain(domain, offset) {
            let PartnerIds = [];
            if (this.networkCrashed) {
                return []
            }
            PartnerIds = await this.rpc({
                model: 'res.partner',
                method: 'search',
                args: [domain],
                kwargs: {
                    offset: 100 * offset,
                    limit: 100,
                    order: 'write_date'
                },
                context: this.env.session.user_context,
            });
            return PartnerIds;
        },

        async _syncPartners() {
            if (this.networkCrashed) {
                return false
            }
            const domain = [['write_date', '>', this.db.write_date_by_model['res.partner']]]
            let offset = 0
            let activeIds = []
            do {
                activeIds = await this._loadPartnersFromOffsetDomain(domain, offset)
                if (activeIds.length > 0) {
                    let datas = await this.getDatasByModel('res.partner', [['id', 'in', activeIds]], null, {})
                    if (datas.length) {
                        this.update_indexDB('res.partner', datas)
                    }
                }
                offset += 1
                console.warn('sync customers with offset: ' + offset)
            } while (activeIds.length);
            let datas = await this.getDatasByModel('pos.cache.database', [['deleted', '=', true], ['res_model', '=', 'res.partner']])
            if (datas.length > 0) {
                console.warn('_syncPartners: STARTING REMOVES TOTAL PARTNERS: ' + datas.length)
                await this.remove_indexDB('res.partner', datas)
            }
            return true
        },

        async syncProductsPartners() {
            this.set_synch('connecting')
            await this._syncProducts()
            await this._syncPartners()
            this.set_synch('connected')
        },

        update_indexDB(model, datas) {
            const orders = this.get('orders').models
            this.indexed_db.write(model, datas);
            this.save_results(model, datas);
            for (let i = 0; i < datas.length; i++) {
                if (model == 'res.partner') {
                    let partner_id = datas[i]['id']
                    let partner = this.db.get_partner_by_id(partner_id)
                    if (partner) {
                        posbus.trigger('reload.client.line', partner_id)
                        orders.forEach(o => {
                            if (o.get_client() && o.get_client().id == partner_id) {
                                o.set_client(partner)
                            }
                        })
                    }
                }
                if (model == 'product.product') {
                    let product_id = datas[i]['id']
                    let product = this.db.get_product_by_id(product_id);
                    if (product) {
                        posbus.trigger('reload.product.item', product_id)
                    }
                }
            }
        },

        remove_indexDB(model, datas) {
            const orders = this.get('orders').models
            datas.forEach(r => r.id = parseInt(r.res_id))
            for (let i = 0; i < datas.length; i++) {
                this.indexed_db.unlink(model, datas[i])
            }
            for (let i = 0; i < datas.length; i++) {
                if (model == 'res.partner') {
                    let partner_id = datas.id
                    orders.forEach(o => {
                        if (o.get_client() && o.get_client().id == partner_id) {
                            o.set_client(null)
                        }
                    })
                }
                if (model == 'product.product') {
                    let productRemoved = datas[i]
                    productRemoved['id'] = parseInt(productRemoved['res_id'])
                    let product_id = productRemoved['id']
                    let product = this.db.get_product_by_id(product_id)
                    if (product) {
                        product['active'] = false
                        product['available_in_pos'] = false
                    }
                    this.removeProductHasDeletedOutOfCart(product_id)
                }
            }
        },

        save_results: function (model, results) {
            // TODO: When loaded all results from indexed DB, we restore back to POS Odoo
            const recordsRemoved = results.filter(r => r['deleted'])
            if (recordsRemoved && recordsRemoved.length) {
                for (let i = 0; i < recordsRemoved.length; i++) {
                    this.indexed_db.unlink(model, recordsRemoved[i]);
                }
            }
            results = results.filter(r => !r['deleted'])
            if (model == 'product.product') {
                this.total_products += results.length;
                console.log('LOADED total products ' + this.total_products)
                this.product_ids = this.product_ids.concat(_.pluck(results, 'id'))
                this.product_model.loaded(this, results)
            }
            if (model == 'res.partner') {
                this.total_clients += results.length;
                console.log('LOADED total partners ' + this.total_clients)
                this.partner_ids = this.partner_ids.concat(_.pluck(results, 'id'))
                this.partner_model.loaded(this, results)
            }
            this.load_datas_cache = true;
            this.db.set_last_write_date_by_model(model, results);
            this.indexed_db.data_by_model[model] = null
        },

        api_install_datas: function (model_name) {
            let self = this;
            let installed = new Promise(function (resolve, reject) {
                function installing_data(model_name, min_id, max_id) {
                    self.setLoadingMessage(model_name + _t(' installing:  from id ') + min_id + _t(' to id ') + max_id)
                    let model
                    if (model_name == 'res.partner') {
                        model = self.partner_model
                    }
                    if (model_name == 'product.product') {
                        model = self.product_model
                    }
                    let domain = [['id', '>=', min_id], ['id', '<', max_id]];
                    let context = {};
                    if (model['model'] == 'product.product') {
                        domain.push(['available_in_pos', '=', true]);
                        let price_id = null;
                        if (self.pricelist) {
                            price_id = self.pricelist.id;
                        }
                        let stock_location_id = null;
                        if (self.config.stock_location_id) {
                            stock_location_id = self.config.stock_location_id[0]
                        }
                        context['location'] = stock_location_id;
                        context['pricelist'] = price_id;
                        context['display_default_code'] = false;
                    }
                    if (min_id == 0) {
                        max_id = self.max_load;
                    }
                    self.rpc({
                        model: 'pos.cache.database',
                        method: 'install_data',
                        args: [null, model_name, min_id, max_id]
                    }).then(function (results) {
                        min_id += self.next_load;
                        if (typeof results == "string") {
                            results = JSON.parse(results);
                        }
                        if (results.length > 0) {
                            max_id += self.next_load;
                            installing_data(model_name, min_id, max_id);
                            self.indexed_db.write(model_name, results);
                            self.save_results(model_name, results);
                        } else {
                            if (max_id < model['max_id']) {
                                max_id += self.next_load;
                                installing_data(model_name, min_id, max_id);
                            } else {
                                resolve()
                            }
                        }
                    }, function (error) {
                        console.error(error.message.message);
                        let db = self.session.db;
                        for (let i = 0; i <= 100; i++) {
                            indexedDB.deleteDatabase(db + '_' + i);
                        }
                        reject(error)
                    })
                }

                installing_data(model_name, 0, self.first_load);
            });
            return installed;
        },

        remove_indexed_db: function () {
            let dbName = this.session.db;
            for (let i = 0; i <= 50; i++) {
                indexedDB.deleteDatabase(dbName + '_' + i);
            }
            console.log('remove_indexed_db succeed !')
        },

        saveQueryLog(key, result) {
            console.warn('saving log of key: ' + key)
            try {
                rpc.query({
                    model: 'pos.query.log',
                    method: 'updateQueryLogs',
                    args: [[], {
                        'key': key,
                        'result': result
                    }],
                })
                return true
            } catch (e) {
                return false
            }

        },

        async after_load_server_data() {
            this.config.limited_products_loading = false
            this.config.partner_load_background = false
            this.models.push(this.product_model)
            this.models.push(this.partner_model)
            if (this.config.qrcode_order_screen && this.config.sync_multi_session) {
                this.listenEventConfirmPlaceOrderOfUsers = new listenEventConfirmPlaceOrderOfUsers(this);
                this.listenEventConfirmPlaceOrderOfUsers.start();
            }
            if (this.programs) {
                const discountLineProductIds = this.programs.map((program) => program.discount_line_product_id[0]);
                const rewardProductIds = this.programs.map((program) => program.reward_product_id[0]);
                const domainProductsProgram = [['id', 'in', discountLineProductIds.concat(rewardProductIds)]];
                const productObject = this.get_model('product.product');
                let productsMissed = await this.rpc({
                    model: 'product.product',
                    method: 'search_read',
                    domain: domainProductsProgram,
                    fields: productObject.fields
                })
                if (productsMissed.length > 0) {
                    productObject.loaded(this, productsMissed)
                }
            }
            let res = await _super_PosModel.after_load_server_data.apply(this, arguments);
            return res
        },

        load_server_data_from_cache: async function (refeshCache = false, disableLoadedDatas = false) {
            const currentPosSessionId = await PosIDB.get('pos_session_id')
            const queryLogs = this.session.queryLogs
            var self = this;
            var progress = 0;
            var progress_step = 1.0 / self.models.length;
            var tmp = {}; // this is used to share a temporary state between models loaders
            const loaded = new Promise(function (resolve, reject) {
                async function load_model(index) {
                    if (index >= self.models.length) {
                        resolve();
                    } else {
                        var model = self.models[index];
                        var cond = typeof model.condition === 'function' ? model.condition(self, tmp) : true;
                        if (!cond) {
                            load_model(index + 1);
                            return;
                        }
                        if (!refeshCache && !disableLoadedDatas) {
                            self.setLoadingMessage(_t('Loading') + ' ' + (model.label || model.model || ''), progress);
                        }
                        var fields = typeof model.fields === 'function' ? model.fields(self, tmp) : model.fields;
                        var domain = typeof model.domain === 'function' ? model.domain(self, tmp) : model.domain;
                        var context = typeof model.context === 'function' ? model.context(self, tmp) : model.context || {};
                        var ids = typeof model.ids === 'function' ? model.ids(self, tmp) : model.ids;
                        var order = typeof model.order === 'function' ? model.order(self, tmp) : model.order;
                        progress += progress_step;
                        if (model.model) {
                            let modelCall = model.model
                            let requestString = JSON.stringify({
                                modelCall,
                                fields,
                                domain,
                                context,
                                ids,
                                order
                            });
                            var params = {
                                model: model.model,
                                context: _.extend(context, self.session.user_context || {}),
                            };

                            if (model.ids) {
                                params.method = 'read';
                                params.args = [ids, fields];
                            } else {
                                params.method = 'search_read';
                                params.domain = domain;
                                params.fields = fields;
                                params.orderBy = order;
                            }
                            model.key = requestString
                            // TODO: refeshCache if active is True, no need get data from cache, it mean only fetch server and save
                            // TODO: never save cache pos config and pos session
                            // TODO: if odoo.pos_session_id change, will refresh cache of local browse
                            if (!refeshCache && currentPosSessionId == odoo.pos_session_id && model.model != 'pos.config' && model.model != 'pos.session' && model.model != 'res.users') {
                                try {
                                    let result = await PosIDB.get(requestString)
                                    if (result == undefined && queryLogs[requestString]) {
                                        result = queryLogs[requestString]
                                    }
                                    if (result != undefined) {
                                        console.warn('Found ( ' + result.length + ' ) of ' + model.model + ' in Browse Cache.')
                                        Promise.resolve(model.loaded(self, result, tmp)).then(function () {
                                                load_model(index + 1);
                                            },
                                            function (err) {
                                                reject(err);
                                            });
                                    } else {
                                        self.rpc(params).then(function (result) {
                                            try { // catching exceptions in model.loaded(...)
                                                if (PosIDB.get('pos_session_id') !== odoo.pos_session_id) {
                                                    PosIDB.set('pos_session_id', odoo.pos_session_id);
                                                    PosIDB.set(requestString, result)
                                                }
                                                self.saveQueryLog(requestString, result)
                                                Promise.resolve(model.loaded(self, result, tmp))
                                                    .then(function () {
                                                            load_model(index + 1);
                                                        },
                                                        function (err) {
                                                            reject(err);
                                                        });
                                            } catch (err) {
                                                console.error(err.message, err.stack);
                                                reject(err);
                                            }
                                        }, function (err) {
                                            reject(err);
                                        });
                                    }

                                } catch (e) {
                                    console.warn('==> has error loading db POS-DB (indexedbd) get datas direct backend')
                                    if (queryLogs[requestString]) {
                                        let result = queryLogs[requestString]
                                        Promise.resolve(model.loaded(self, result, tmp)).then(function () {
                                                load_model(index + 1);
                                            },
                                            function (err) {
                                                reject(err);
                                            });
                                    } else {
                                        self.rpc(params).then(function (result) {
                                            try { // catching exceptions in model.loaded(...)
                                                if (currentPosSessionId == odoo.pos_session_id) {
                                                    PosIDB.set('pos_session_id', odoo.pos_session_id);
                                                    PosIDB.set(requestString, result)
                                                }
                                                self.saveQueryLog(requestString, result)
                                                Promise.resolve(model.loaded(self, result, tmp))
                                                    .then(function () {
                                                            load_model(index + 1);
                                                        },
                                                        function (err) {
                                                            reject(err);
                                                        });
                                            } catch (err) {
                                                console.error(err.message, err.stack);
                                                reject(err);
                                            }
                                        }, function (err) {
                                            reject(err);
                                        });
                                    }
                                }

                            } else {
                                self.rpc(params).then(function (result) {
                                    try { // catching exceptions in model.loaded(...)
                                        PosIDB.set('pos_session_id', odoo.pos_session_id);
                                        PosIDB.set(requestString, result)
                                        self.saveQueryLog(requestString, result)
                                        if (!disableLoadedDatas) {
                                            Promise.resolve(model.loaded(self, result, tmp))
                                                .then(function () {
                                                        load_model(index + 1);
                                                    },
                                                    function (err) {
                                                        reject(err);
                                                    });
                                        } else {
                                            Promise.resolve()
                                            load_model(index + 1);
                                        }

                                    } catch (err) {
                                        console.error(err.message, err.stack);
                                        reject(err);
                                    }
                                }, function (err) {
                                    reject(err);
                                });
                            }
                        } else if (model.loaded) {
                            try { // catching exceptions in model.loaded(...)
                                Promise.resolve(model.loaded(self, tmp))
                                    .then(function () {
                                            load_model(index + 1);
                                        },
                                        function (err) {
                                            reject(err);
                                        });
                            } catch (err) {
                                reject(err);
                            }
                        } else {
                            load_model(index + 1);
                        }
                    }
                }

                try {
                    return load_model(0);
                } catch (err) {
                    return Promise.reject(err);
                }
            });
            return loaded
        },

        load_server_data_from_iot: function (refeshCache = false, disableLoadedDatas = false) {
            const self = this;
            var progress = 0;
            var progress_step = 1.0 / self.models.length;
            var tmp = {}; // this is used to share a temporary state between models loaders
            const iotUrl = 'http://' + odoo.proxy_ip + ':8069'
            const iotConnection = new Session(void 0, iotUrl, {
                use_cors: true
            });
            var loaded = new Promise(function (resolve, reject) {
                async function load_model(index) {
                    if (index >= self.models.length) {
                        resolve();
                    } else {
                        var model = self.models[index];
                        var cond = typeof model.condition === 'function' ? model.condition(self, tmp) : true;
                        if (!cond) {
                            load_model(index + 1);
                            return;
                        }
                        if (!refeshCache && !disableLoadedDatas) {
                            self.setLoadingMessage(_t('Loading') + ' ' + (model.label || model.model || ''), progress);
                        }

                        var fields = typeof model.fields === 'function' ? model.fields(self, tmp) : model.fields;
                        var domain = typeof model.domain === 'function' ? model.domain(self, tmp) : model.domain;
                        var context = typeof model.context === 'function' ? model.context(self, tmp) : model.context || {};
                        var ids = typeof model.ids === 'function' ? model.ids(self, tmp) : model.ids;
                        var order = typeof model.order === 'function' ? model.order(self, tmp) : model.order;
                        progress += progress_step;

                        if (model.model) {
                            var params = {
                                model: model.model,
                                context: _.extend(context, self.session.user_context || {}),
                            };

                            if (model.ids) {
                                params.method = 'read';
                                params.args = [ids, fields];
                            } else {
                                params.method = 'search_read';
                                params.domain = domain;
                                params.fields = fields;
                                params.orderBy = order;
                            }
                            let modelCall = model.model
                            let requestString = JSON.stringify({
                                modelCall,
                                fields,
                                domain,
                                context,
                                ids,
                                order
                            });
                            let cacheResult = null
                            try {
                                cacheResult = await iotConnection.rpc('/hw_cache/get', {key: requestString})
                            } catch (e) {
                                console.error(e)
                            }
                            if (!cacheResult || refeshCache) {
                                self.rpc(params).then(function (result) {
                                    iotConnection.rpc('/hw_cache/save', {key: requestString, value: result})
                                    try { // catching exceptions in model.loaded(...)
                                        if (!disableLoadedDatas) {
                                            Promise.resolve(model.loaded(self, result, tmp))
                                                .then(function () {
                                                        load_model(index + 1);
                                                    },
                                                    function (err) {
                                                        reject(err);
                                                    });
                                        } else {
                                            Promise.resolve()
                                            load_model(index + 1);
                                        }

                                    } catch (err) {
                                        console.error(err.message, err.stack);
                                        reject(err);
                                    }
                                }, function (err) {
                                    reject(err);
                                });
                            } else {
                                try { // catching exceptions in model.loaded(...)
                                    if (!disableLoadedDatas) {
                                        Promise.resolve(model.loaded(self, cacheResult, tmp))
                                            .then(function () {
                                                    load_model(index + 1);
                                                },
                                                function (err) {
                                                    reject(err);
                                                });
                                    } else {
                                        Promise.resolve()
                                        load_model(index + 1);
                                    }
                                } catch (err) {
                                    console.error(err.message, err.stack);
                                    reject(err);
                                }
                            }
                        } else if (model.loaded) {
                            try { // catching exceptions in model.loaded(...)
                                Promise.resolve(model.loaded(self, tmp))
                                    .then(function () {
                                            load_model(index + 1);
                                        },
                                        function (err) {
                                            reject(err);
                                        });
                            } catch (err) {
                                reject(err);
                            }
                        } else {
                            load_model(index + 1);
                        }
                    }
                }

                try {
                    return load_model(0);
                } catch (err) {
                    return Promise.reject(err);
                }
            });
            return loaded
        },

        load_server_data: function (refeshCache = false, disableLoadedDatas = false) {
            console.log('load_server_data()')
            const self = this;
            return _super_PosModel.load_server_data.apply(this, arguments)
            // if (odoo.cache != 'browse' && odoo.cache != 'iot') {
            //     return _super_PosModel.load_server_data.apply(this, arguments)
            // }
            // console.log('[POS Config] active cache feature !!!')
            // console.log('cache type: ' + odoo.cache)
            // if (odoo.cache == 'iot') {
            //     return this.load_server_data_from_iot(refeshCache, disableLoadedDatas)
            // } else {
            //     return this.load_server_data_from_cache(refeshCache, disableLoadedDatas)
            // }
        },
    });

    db.include({
        init: function (options) {
            this._super(options);
            this.write_date_by_model = {};
            this.products_removed = [];
            this.partners_removed = [];
        },
        set_last_write_date_by_model: function (model, results) {
            /* TODO: this method overide method set_last_write_date_by_model of Databse.js
                We need to know last records updated (change by backend clients)
                And use field write_date compare datas of pos and datas of backend
                We are get best of write date and compare
             */
            for (let i = 0; i < results.length; i++) {
                let line = results[i];
                if (!line.write_date) continue
                if (!this.write_date_by_model[model]) {
                    this.write_date_by_model[model] = line.write_date;
                    continue;
                }
                if (this.write_date_by_model[model] != line.write_date && new Date(this.write_date_by_model[model]).getTime() < new Date(line.write_date).getTime()) {
                    this.write_date_by_model[model] = line.write_date
                }
            }
            let d = new Date(this.write_date_by_model[model])
            let timeObject = new Date(d.getTime() + 1000);
            let saveTime = timeObject.getTime()
            this.write_date_by_model[model] = field_utils.format.datetime(field_utils.parse.datetime(new Date(saveTime)))
            console.log('Last Write Date of model ' + model + ' is ' + this.write_date_by_model[model])
        },

        // default odoo, if have not any char on search box (clientListScreen), odoo will call this method with max_count is 1000
        // so, we down it to limit db
        get_partners_sorted: function (max_count) {
            if (max_count && max_count >= this.limit) {
                max_count = this.limit
            }
            let results = this._super(max_count)
            return results
        },

        get_product_by_category: function (category_id) {
            let list = this._super(category_id);
            if (category_id == 0) {
                list = this.getAllProducts(this.limit)
            }
            return list;
        },
    });

    models.load_models([
        {
            label: 'Reload Session',
            condition: function (self) {
                return self.pos_session.required_reinstall_cache;
            },
            loaded: function (self) {
                return self.reloadPosScreen()
            },
        },
        {
            label: 'Ping Cache Server',
            condition: function (self) {
                return odoo.cache == 'iot';
            },
            loaded: function (self) {
                const iotUrl = 'http://' + odoo.proxy_ip + ':8069'
                const iotConnection = new Session(void 0, iotUrl, {
                    use_cors: true
                });
                return iotConnection.rpc('/hw_cache/ping', {}).then(function (result) {
                    if (result == 'ping') {
                        console.log('Cache Server is running')
                    }
                }, function (error) {
                    alert('Could not connect to IOT IP Address:' + iotUrl)
                })
            },
        },
    ], {
        after: 'pos.config'
    });

    models.load_models([
        {
            label: 'Stock Production Lot',
            model: 'stock.production.lot',
            fields: ['name', 'ref', 'product_id', 'product_uom_id', 'create_date', 'product_qty', 'barcode', 'replace_product_public_price', 'public_price', 'expiration_date'],
            lot: true,
            domain: function (self) {
                return []
            },
            loaded: function (self, lots) {
                lots = lots.filter(l => {
                    if (!l['expiration_date'] || (l['expiration_date'] >= time.date_to_str(new Date()) + " " + time.time_to_str(new Date()))) {
                        return true
                    } else {
                        return false
                    }
                })
                self.lots = lots;
                self.lot_by_name = {};
                self.lot_by_id = {};
                self.lot_by_product_id = {};
                for (let i = 0; i < self.lots.length; i++) {
                    let lot = self.lots[i];
                    self.lot_by_name[lot['name']] = lot;
                    self.lot_by_id[lot['id']] = lot;
                    if (!self.lot_by_product_id[lot.product_id[0]]) {
                        self.lot_by_product_id[lot.product_id[0]] = [lot];
                    } else {
                        self.lot_by_product_id[lot.product_id[0]].push(lot);
                    }
                }
            }
        },
        {
            label: 'Products & Customers',
            installed: true,
            condition: function (self) {
                if (self.session.model_ids['product.product'].count > 1000 || self.session.model_ids['res.partner'].count > 1000) {
                    return true
                } else {
                    return false
                }
            },
            loaded: async function (self) {
                await self.indexed_db.get_datas('product.product', 10)
                await self.indexed_db.get_datas('res.partner', 10)
                const products = self.indexed_db.data_by_model['product.product']
                if (products) {
                    await self.save_results('product.product', products)
                }
                const partners = self.indexed_db.data_by_model['res.partner']
                if (partners) {
                    await self.save_results('res.partner', partners)
                }
                if (products && partners) {
                    await self.syncProductsPartners()
                }
            }
        }
    ], {
        after: 'pos.category'
    });

    models.load_models([
        {
            label: 'Installing Products',
            condition: function (self) {
                if ((self.session.model_ids['product.product'].count > 1000 || self.session.model_ids['res.partner'].count > 1000) && self.total_products == 0) {
                    return true
                } else {
                    return false
                }
            },
            loaded: async function (self) {
                self.first_install_cache = true
                return await self.api_install_datas('product.product')
            }
        },
        {
            label: 'Installing Customers',
            condition: function (self) {
                if ((self.session.model_ids['product.product'].count > 1000 || self.session.model_ids['res.partner'].count > 1000) && self.total_clients == 0) {
                    return true
                } else {
                    return false
                }
            },
            loaded: async function (self) {
                return await self.api_install_datas('res.partner')
            }
        },
        {
            label: 'Sync Customers and Products',
            condition: function (self) {
                return self.first_install_cache
            },
            loaded: async function (self) {
                await self.syncProductsPartners()
            }
        },
        {
            label: 'POS Orders',
            condition: function (self) {
                return false
            },
            model: 'pos.order',
            context: function (self) {
                return {pos_config_id: self.config.id}
            },
            fields: [
                'create_date',
                'name',
                'date_order',
                'user_id',
                'amount_tax',
                'amount_total',
                'amount_paid',
                'amount_return',
                'to_ship',
                'pricelist_id',
                'partner_id',
                'sequence_number',
                'session_id',
                'state',
                'account_move',
                'picking_ids',
                'picking_type_id',
                'location_id',
                'note',
                'nb_print',
                'pos_reference',
                'payment_journal_id',
                'fiscal_position_id',
                'ean13',
                'expire_date',
                'is_return',
                'is_returned',
                'voucher_id',
                'email',
                'write_date',
                'config_id',
                'is_paid_full',
                'partial_payment',
                'session_id',
                'shipping_id',
            ],
            domain: function (self) {
                let domain = [];
                return domain
            },
            loaded: function (self, orders) {
                self.savePosOrders(orders)
            }
        }, {
            label: 'POS Order Lines',
            condition: function (self) {
                return false
            },
            model: 'pos.order.line',
            fields: [
                'name',
                'notice',
                'product_id',
                'price_unit',
                'qty',
                'price_subtotal',
                'price_subtotal_incl',
                'discount',
                'order_id',
                'plus_point',
                'redeem_point',
                'promotion',
                'promotion_reason',
                'is_return',
                'uom_id',
                'user_id',
                'note',
                'discount_reason',
                'create_uid',
                'write_date',
                'create_date',
                'config_id',
                'variant_ids',
                'returned_qty',
                'pack_lot_ids',
            ],
            domain: function (self) {
                return [['order_id', 'in', self.order_ids]]
            },
            loaded: function (self, order_lines) {
                self.savePosOrderLines(order_lines)
            }
        }, {
            label: 'POS Payment',
            model: 'pos.payment',
            condition: function (self) {
                return false
            },
            fields: [
                'payment_date',
                'pos_order_id',
                'amount',
                'payment_method_id',
                'name',
            ],
            domain: function (self) {
                return [['pos_order_id', 'in', self.order_ids]]
            },
            loaded: function (self, payments) {
                self.savePosPaymentLines(payments)
            }
        }, {
            label: 'POS Pack Operation Lot',
            model: 'pos.pack.operation.lot',
            condition: function (self) {
                return false
            },
            fields: [
                'lot_name',
                'pos_order_line_id',
                'product_id',
                'lot_id',
                'quantity',
            ],
            domain: function (self) {
                return [['pos_order_line_id', 'in', self.orderline_ids]]
            },
            condition: function (self) {
                return self.config.pos_orders_management;
            },
            loaded: function (self, pack_operation_lots) {
                self.savePackOperationLot(pack_operation_lots)
            }
        }, {
            label: 'Sale Orders',
            model: 'sale.order',
            fields: [
                'create_date',
                'pos_config_id',
                'pos_location_id',
                'name',
                'origin',
                'client_order_ref',
                'state',
                'date_order',
                'validity_date',
                'user_id',
                'partner_id',
                'pricelist_id',
                'invoice_ids',
                'partner_shipping_id',
                'payment_term_id',
                'note',
                'amount_tax',
                'amount_total',
                'picking_ids',
                'delivery_address',
                'delivery_date',
                'delivery_phone',
                'book_order',
                'payment_partial_amount',
                'payment_partial_method_id',
                'write_date',
                'ean13',
                'pos_order_id',
                'write_date',
                'reserve_order',
                'reserve_from',
                'reserve_to',
                'reserve_table_id',
                'reserve_no_of_guests',
                'reserve_mobile',
                'ean13',
                'pos_order_id',
            ],
            domain: function (self) {
                let domain = [];
                return domain
            },
            condition: function (self) {
                return false
            },
            context: function (self) {
                return {pos_config_id: self.config.id}
            },
            loaded: function (self, orders) {
                self.saveSaleOrders(orders)
            }
        }, {
            model: 'sale.order.line',
            fields: [
                'name',
                'discount',
                'product_id',
                'order_id',
                'price_unit',
                'price_subtotal',
                'price_tax',
                'price_total',
                'product_uom',
                'product_uom_qty',
                'qty_delivered',
                'qty_invoiced',
                'tax_id',
                'variant_ids',
                'state',
                'write_date'
            ],
            condition: function (self) {
                return false
            },
            domain: function (self) {
                return [['order_id', 'in', self.booking_ids]]
            },
            context: {'pos': true},
            loaded: function (self, order_lines) {
                self.saveSaleOrderLines(order_lines)
            }
        },
        {
            model: 'account.move',
            fields: [
                'create_date',
                'name',
                'date',
                'ref',
                'state',
                'move_type',
                'auto_post',
                'journal_id',
                'partner_id',
                'amount_tax',
                'amount_total',
                'amount_untaxed',
                'amount_residual',
                'invoice_user_id',
                'payment_reference',
                'payment_state',
                'invoice_date',
                'invoice_date_due',
                'invoice_payment_term_id',
                'stock_move_id',
                'write_date',
                'currency_id',
            ],
            condition: function (self) {
                return false
            },
            domain: function (self) {
                let domain = [['company_id', '=', self.company.id]];
                return domain
            },
            context: function (self) {
                return {pos_config_id: self.config.id}
            },
            loaded: function (self, moves) {
                self.saveMoves(moves)
            },
            retail: true,
        },
        {
            model: 'account.move.line',
            fields: [
                'move_id',
                'move_name',
                'date',
                'ref',
                'journal_id',
                'account_id',
                'sequence',
                'name',
                'quantity',
                'price_unit',
                'discount',
                'debit',
                'credit',
                'balance',
                'price_subtotal',
                'price_total',
                'write_date'
            ],
            condition: function (self) {
                return false
            },
            domain: function (self) {
                return [['move_id', 'in', self.invoice_ids]]
            },
            context: {'pos': true},
            loaded: function (self, invoice_lines) {
                self.db.save_invoice_lines(invoice_lines);
            },
            retail: true,
        }
    ]);

    let _super_Order = models.Order.prototype;
    models.Order = models.Order.extend({
        set_client: function (client) {
            if (!this.pos.the_first_load && client && client['id'] && this.pos.deleted['res.partner'] && this.pos.deleted['res.partner'].indexOf(client['id']) != -1) {
                client = null;
                return this.env.pos.alert_message({
                    title: this.env._t('Warning'),
                    body: this.env._t('This client deleted from backend')
                })
            }
            _super_Order.set_client.apply(this, arguments);
        },
    });
})
;
