odoo.define('pos_retail.SaleOrderScreen', function (require) {
    'use strict';

    const {debounce} = owl.utils;
    const PosComponent = require('point_of_sale.PosComponent');
    const Registries = require('point_of_sale.Registries');
    const {useListener} = require('web.custom_hooks');
    const {useState} = owl.hooks;

    class SaleOrderScreen extends PosComponent {
        constructor() {
            super(...arguments);

            this.state = useState({
                orders: this.env.pos.db.get_sale_orders() || [],
                query: null,
                selectedOrder: this.props.order,
                selectedClient: this.props.selectedClient,
                detailIsShown: false,
                isEditMode: false,
                editModeProps: {
                    order: null,
                    selectedClient: null
                },
                sort_field: null,
                reverse: true
            })
            this.updateOrderList = debounce(this.updateOrderList, 70);
            useListener('filter-selected', this._onFilterSelected);
            useListener('search', this._onSearch);
            useListener('event-keyup-search-order', this._eventKeyupSearchOrder);
            this.searchDetails = {};
            this.filter = null;
            this._initializeSearchFieldConstants();
            this.orders = this.env.pos.db.get_sale_orders()
        }

        _sortField(fieldSort, int=false) {
            this.state.sort_field = fieldSort
            this.state.reverse = !this.state.reverse
            this.state.sortInt = int
        }

        reloadSaleLines() {
            let reload_models = _.filter(this.env.pos.models, function (model) {
                return model.model == 'sale.order.line';
            });
            if (reload_models.length > 0) {
                this.env.pos.load_server_data_by_model(reload_models[0]);
            }
        }

        back() {
            if (this.state.detailIsShown) {
                this.state.detailIsShown = false;
                this.render();
            } else {
                this.props.resolve({confirmed: false, payload: false});
                this.trigger('close-temp-screen');
            }
        }

        confirm() {
            this.props.resolve({confirmed: true, payload: this.state.selectedOrder});
            this.trigger('close-temp-screen');
        }

        get currentOrder() {
            return this.env.pos.get_order();
        }

        get getOrders() {
            const filterCheck = (order) => {
                if (this.filter && this.filter != 'all') {
                    if (this.filter == order.state) {
                        return true
                    } else {
                        return false
                    }
                }
                return true;
            };
            const {fieldValue, searchTerm} = this.searchDetails;
            const fieldAccessor = this._searchFields[fieldValue];
            const searchCheck = (order) => {
                if (!fieldAccessor) return true;
                const fieldValue = fieldAccessor(order);
                if (fieldValue === null) return true;
                if (!searchTerm) return true;
                return fieldValue && fieldValue.toString().toLowerCase().includes(searchTerm.toLowerCase());
            };
            const predicate = (order) => {
                return filterCheck(order) && searchCheck(order);
            };
            let orders = this.orderList.filter(predicate);
            if (this.state.sort_field) {
                if (this.state.sortInt) {
                    orders = orders.sort(this.env.pos.sort_by(this.state.sort_field, this.state.reverse, parseInt))
                } else {
                    orders = orders.sort(this.env.pos.sort_by(this.state.sort_field, this.state.reverse, function (a) {
                        if (!a) {
                            a = 'N/A'
                        }
                        return a.toUpperCase()
                    }))
                }
            } else {
                orders = orders.sort(this.env.pos.sort_by('id', true, parseInt))
            }
            return orders
        }

        get isNextButtonVisible() {
            return this.state.selectedOrder ? true : false;
        }

        /**
         * Returns the text and command of the next button.
         * The command field is used by the clickNext call.
         */
        get nextButton() {
            if (!this.props.order) {
                return {command: 'set', text: 'Set Customer'};
            } else if (this.props.order && this.props.order === this.state.selectedOrder) {
                return {command: 'deselect', text: 'Deselect Customer'};
            } else {
                return {command: 'set', text: 'Change Customer'};
            }
        }

        // Methods

        // We declare this event handler as a debounce function in
        // order to lower its trigger rate.
        updateOrderList(event) {
            this.state.query = event.target.value;
            const clients = this.clients;
            if (event.code === 'Enter' && clients.length === 1) {
                this.state.selectedOrder = clients[0];
                this.clickNext();
            } else {
                this.render();
            }
        }

        clickOrder(event) {
            let order = event.detail.order;
            this.state.selectedOrder = order;
            this.state.editModeProps = {
                order: this.state.selectedOrder,
                selectedOrder: this.state.selectedOrder
            };
            this.state.detailIsShown = true;
            this.render();
        }

        clickNext() {
            this.state.selectedOrder = this.nextButton.command === 'set' ? this.state.selectedOrder : null;
            this.confirm();
        }

        async clearSearch() {
            this.state.loading = true
            await this.env.pos.getSaleOrders()
            this._initializeSearchFieldConstants()
            this.filter = this.filterOptions[0];
            this.searchDetails = {};
            this.orders = this.env.pos.db.get_sale_orders()
            this.state.loading = false
        }


        // TODO: ==================== Search bar example ====================

        get searchBarConfig() {
            return {
                searchFields: this.constants.searchFieldNames,
                filter: {show: true, options: this.filterOptions},
                defaultSearchDetails: {
                    fieldName: 'RECEIPT_NUMBER',
                    searchTerm: '',
                },
                defaultFilter: null
            };
        }

        get _searchFields() {
            return {} // TODO: 15.07.2021 turnoff it, automatic search when cashier typing searchbox
        }

        // TODO: define group filters
        get filterOptions() { // list state for filter
            this.sepecialFilter = new Map()
            this.sepecialFilter.set('all', {
                key: 'all',
                text: this.env._t('All Orders'),
            })
            this.sepecialFilter.set('draft', {
                key: 'draft',
                text: this.env._t('Quotation'),
            })
            this.sepecialFilter.set('booking', {
                key: 'booking',
                text: this.env._t('Reserved or Booking'),
            })
            this.sepecialFilter.set('sent', {
                key: 'sent',
                text: this.env._t('Quotation Sent'),
            })
            this.sepecialFilter.set('sale', {
                key: 'sale',
                text: this.env._t('Sale Order'),
            })
            this.sepecialFilter.set('done', {
                key: 'done',
                text: this.env._t('Looked'),
            })
            this.sepecialFilter.set('cancel', {
                key: 'cancel',
                text: this.env._t('Cancelled'),
            })
            this.sepecialFilter.set('booked', {
                key: 'booked',
                text: this.env._t('Booked'),
            })
            return this.sepecialFilter
        }


        // TODO: register search bar
        _initializeSearchFieldConstants() {
            this.constants = {};
            Object.assign(this.constants, {
                searchFieldNames: Object.keys(this._searchFields),
            });
        }

        // TODO: save filter selected on searchbox of user for getOrders()
        _onFilterSelected(event) {
            this.filter = event.detail.filter;
            this.render();
        }

        // TODO: save search detail selected on searchbox of user for getOrders()
        _onSearch(event) {
            const searchDetails = event.detail;
            Object.assign(this.searchDetails, searchDetails);
            this.render();
        }

        async _eventKeyupSearchOrder(event) {
            const self = this
            const searchInput = event.detail
            if (searchInput != "") {
                this.orders = this.env.pos.db.search_sale_orders(searchInput)
            } else {
                this.orders = this.env.pos.db.get_sale_orders()
            }
            if (this.orders.length == 0) {
                let order_object = this.env.pos.get_model('sale.order');
                let orders = await this.rpc({
                    model: 'sale.order',
                    method: 'search_read',
                    fields: order_object.fields,
                    domain: ['|', '|', ['name', 'ilike', searchInput], ['ean13', 'ilike', searchInput], ['note', 'ilike', searchInput]]
                }).then(function (orders) {
                    return orders
                }, function (error) {
                    self.env.pos.alert_message({
                        title: self.env._t('Error'),
                        body: self.env._t('Odoo Server Offline or Your Internet have lose connection')
                    })
                    return null
                })
                if (orders && orders.length) {
                    let orderIds = []
                    this.env.pos.saveSaleOrders(orders)
                    orders.forEach(o => {
                        orderIds.push(o.id)
                    })
                    let orderLineObject = this.env.pos.get_model('sale.order.line');
                    let orderLines = await this.rpc({
                        model: 'sale.order.line',
                        method: 'search_read',
                        fields: orderLineObject.fields,
                        args: [[['order_id', 'in', orderIds]]]
                    })
                    this.env.pos.saveSaleOrderLines(orderLines)
                    this.orders = this.env.pos.db.search_sale_orders(searchInput)
                }
            }
            this.render()
        }

        // TODO: return orders of system
        get orderList() {
            return this.orders
        }
    }

    SaleOrderScreen.template = 'SaleOrderScreen';

    Registries.Component.add(SaleOrderScreen);

    return SaleOrderScreen;
});
