odoo.define('pos_retail.ProductOnHand', function (require) {
    'use strict';
    const PosComponent = require('point_of_sale.PosComponent');
    const Registries = require('point_of_sale.Registries');
    const {useState} = owl.hooks;
    const bus = require('pos_retail.core_bus');

    class ProductOnHand extends PosComponent {
        constructor() {
            super(...arguments);
            this.state = useState({
                qty_available: 0
            });
        }

        mounted() {
            super.mounted();
            this._loadStock()
            this.startPolling()
        }

        startPolling() {
            const self = this
            this.bus = bus.bus
            this.bus.last = 0
            this.bus.on("notification", this, this._busNotification);
            this.bus.start_polling();
        }

        _busNotification(notifications) {
            const currentStock = this.env.pos.get_source_stock_location()
            if (notifications && notifications[0] && notifications[0][1]) {
                const type = notifications[0][1]['type']
                const payload = notifications[0][1]['payload']
                if (type == "pos.sync.stock") {
                    if (payload.product_ids.indexOf(this.props.product.id) != -1 && currentStock['id'] == payload['location_id']) {
                        this._loadStock(true)
                    }
                }
            }
        }

        get addedClasses() {
            if (this.state.qty_available > 0 && this.state.qty_available < 10) {
                return {
                    'low-stock': true
                }
            } else if (this.state.qty_available >= 10) {
                return {
                    'normal-stock': true
                }
            } else if (this.state.qty_available <= 0) {
                return {
                    'out-of-stock': true
                }
            }
        }


        async _loadStock(alert) {
            console.log('_loadStock of product : ' + this.props.product.display_name)
            if (this.env.pos.get_order()) {
                let currentStockLocation = this.env.pos.get_source_stock_location()
                const stock_datas = await this.env.pos.getStockDatasByLocationIds([this.props.product.id], [currentStockLocation['id']])
                for (let location_id in stock_datas) {
                    location_id = parseInt(location_id)
                    let location = this.env.pos.stock_location_by_id[location_id];
                    if (location) {
                        const qty_available = stock_datas[location_id][this.props.product.id]
                        this.props.product.qty_available = qty_available
                        this.state.qty_available = qty_available
                        if (alert) {
                            this.env.pos.alert_message({
                                title: this.env._t('New Stock Update'),
                                body: this.props.product.display_name + this.env._t(' now has stock on hand is: ') + this.env.pos.format_currency_no_symbol(this.state.qty_available)
                            })
                        }
                        if (this.env.pos.config.notification_out_of_stock > 0 && this.state.qty_available <= qty_available) {
                            const action = this.props.product.display_name + this.env._t(' will out of stock')
                            const description = this.props.product.display_name + this.env._t(' will out of stock')
                            const action_strId = this.props.product.id + '_' + location.id
                            const type = 'out_stock'
                            await this.env.pos.get_order()._requestApproveAction(action, description, action_strId, type, this.props.product.id, location_id)
                        }
                        break
                    }
                }
            }
        }

        async updateStockEachLocation() {
            if (!this.env.pos.config.update_stock_onhand) {
                return this.showPopup('ErrorPopup', {
                    title: this.env._t('Error'),
                    body: this.env._t('You have not permission Update Stock of Products')
                });
            }
            const product = this.props.product
            let stock_location_ids = this.env.pos.get_all_source_locations();
            let stock_datas = await this.env.pos.getStockDatasByLocationIds([product.id], stock_location_ids)
            if (stock_datas) {
                let items = [];
                let withLot = false
                if (product.tracking == 'lot') {
                    withLot = true
                }
                if (!withLot) {
                    for (let location_id in stock_datas) {
                        let location = this.env.pos.stock_location_by_id[location_id];
                        if (location) {
                            items.push({
                                id: location.id,
                                item: location,
                                location_id: location.id,
                                quantity: stock_datas[location_id][product.id]
                            })
                        }
                    }
                } else {
                    let stockQuants = await this.rpc({
                        model: 'stock.quant',
                        method: 'search_read',
                        domain: [['product_id', '=', product.id], ['location_id', 'in', stock_location_ids]],
                        fields: [],
                        context: {
                            limit: 1
                        }
                    })
                    if (stockQuants) {
                        items = stockQuants.map((q) => ({
                            id: q.id,
                            item: q,
                            lot_id: q.lot_id[0],
                            lot_name: q.lot_id[1],
                            location_id: q.location_id[0],
                            location_name: q.location_id[1],
                            quantity: q.quantity
                        }));
                    }
                }
                if (items.length) {
                    let {confirmed, payload: result} = await this.showPopup('UpdateStockOnHand', {
                        title: this.env._t('Summary Stock on Hand (Available - Reserved) each Stock Location of [ ') + product.display_name + ' ]',
                        withLot: withLot,
                        array: items,
                    })
                    if (confirmed) {
                        const newStockArray = result.newArray

                        for (let i = 0; i < newStockArray.length; i++) {
                            let newStock = newStockArray[i];
                            if (!withLot) {
                                await this.rpc({
                                    model: 'stock.location',
                                    method: 'pos_update_stock_on_hand_by_location_id',
                                    args: [newStock['location_id'], {
                                        product_id: product.id,
                                        product_tmpl_id: product.product_tmpl_id,
                                        quantity: parseFloat(newStock['quantity']),
                                        location_id: newStock['location_id']
                                    }],
                                    context: {}
                                }, {
                                    shadow: true,
                                    timeout: 65000
                                })
                            } else {
                                await this.rpc({
                                    model: 'stock.quant',
                                    method: 'write',
                                    args: [newStock['id'], {
                                        quantity: parseFloat(newStock['quantity']),
                                    }],
                                    context: {}
                                }, {
                                    shadow: true,
                                    timeout: 65000
                                })
                            }
                        }
                        this._loadStock()
                        this.env.pos.alert_message({
                            title: product.display_name,
                            body: this.env._t('Successfully update stock on hand'),
                            color: 'success'
                        })
                        return this.updateStockEachLocation(product)
                    }
                } else {
                    return this.env.pos.alert_message({
                        title: this.env._t('Warning'),
                        body: product.display_name + this.env._t(' not found stock on hand !!!')
                    })
                }
            }
        }
    }

    ProductOnHand.template = 'ProductOnHand';

    Registries.Component.add(ProductOnHand);

    return ProductOnHand;
});
