odoo.define('pos_retail.PosOrderScreen', function (require) {
    'use strict';

    const {debounce} = owl.utils;
    const PosComponent = require('point_of_sale.PosComponent');
    const Registries = require('point_of_sale.Registries');
    const {useListener} = require('web.custom_hooks');
    const {useState} = owl.hooks;

    /**
     * @props order - originally selected order
     */
    class PosOrderScreen extends PosComponent {
        constructor() {
            super(...arguments);
            useListener('click-view', () => this.viewOrder());
            this.state = useState({
                query: null,
                selectedOrder: this.props.order,
                selectedClient: this.props.selectedClient,
                detailIsShown: false,
                isEditMode: false,
                editModeProps: {
                    order: null,
                    selectedClient: null,
                },
                sort_field: null,
                reverse: true
            })
            if (this.props.order) {
                this.state.detailIsShown = true
                this.state.editModeProps = {
                    order: this.props.order,
                };
            }
            this.updateOrderList = debounce(this.updateOrderList, 70);
            useListener('filter-selected', this._onFilterSelected);
            useListener('search', this._onSearch);
            useListener('event-keyup-search-order', this._eventKeyupSearchOrder);
            this.searchDetails = {};
            this.filter = null;
            this._initializeSearchFieldConstants();
            this.orders = this.env.pos.db.get_pos_orders()
        }

        _sortField(fieldSort, int = false) {
            this.state.sort_field = fieldSort
            this.state.reverse = !this.state.reverse
            this.state.sortInt = int
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
                if (this.filter == 'to_ship') {
                    return order['to_ship']
                }
                if (this.filter == 'current_session') {
                    if (order['session_id'] && order['session_id'][0] == this.env.pos.pos_session.id) {
                        return true
                    } else {
                        return false
                    }
                }
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
            let client = this.state.selectedClient;
            if (client) {
                orders = orders.filter((o) => o.partner_id && o.partner_id[0] == client.id)
            }
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
            let orderId = event.detail.id;
            let orderSelected = this.env.pos.db.order_by_id[orderId]
            this.state.selectedOrder = orderSelected;
            this.state.editModeProps = {
                order: this.state.selectedOrder,
                selectedOrder: this.state.selectedOrder
            };
            this.state.detailIsShown = true;
            this.render();
        }

        viewOrder() {
            this.state.editModeProps = {
                order: this.state.selectedOrder,
            };
            this.render();
        }

        clickNext() {
            this.state.selectedOrder = this.nextButton.command === 'set' ? this.state.selectedOrder : null;
            this.confirm();
        }

        activateEditMode(event) {
            const {isNewClient} = event.detail;
            this.state.isEditMode = true;
            this.state.detailIsShown = true;
            this.state.isNewClient = isNewClient;
            if (!isNewClient) {
                this.state.editModeProps = {
                    partner: this.state.selectedOrder,
                };
            }
            this.render();
        }

        deactivateEditMode() {
            this.state.isEditMode = false;
            this.state.editModeProps = {
                partner: {
                    country_id: this.env.pos.company.country_id,
                    state_id: this.env.pos.company.state_id,
                },
            };
            this.render();
        }

        cancelEdit() {
            this.deactivateEditMode();
        }

        async clearSearch() {
            this.state.loading = true
            await this.env.pos.getPosOrders()
            this._initializeSearchFieldConstants()
            this.searchDetails = {};
            this.state.editModeProps = {
                order: null,
                selectedClient: null
            };
            this.state.selectedClient = null
            this.state.selectedOrder = null
            this.filter = null
            this.orders = this.env.pos.db.get_pos_orders()
            this.state.sort_field = null
            this.state.loading = false
        }


        // TODO: ==================== Seach bar example ====================

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

        // TODO: define search fields
        get _searchFields() {
            return {}
        }

        // TODO: define group filters
        get filterOptions() { // list state for filter
            this.sepecialFilter = new Map()
            this.sepecialFilter.set('all', {
                key: 'all',
                text: this.env._t('All Orders'),
            })
            this.sepecialFilter.set('current_session', {
                key: 'current_session',
                text: this.env._t('Current Session'),
            })
            this.sepecialFilter.set('to_ship', {
                key: 'to_ship',
                text: this.env._t('To Ship'),
            })
            this.sepecialFilter.set('all', {
                key: 'all',
                text: this.env._t('All Orders'),
            })
            this.sepecialFilter.set('draft', {
                key: 'draft',
                text: this.env._t('New'),
            })
            this.sepecialFilter.set('cancel', {
                key: 'cancel',
                text: this.env._t('Cancelled'),
            })
            this.sepecialFilter.set('paid', {
                key: 'paid',
                text: this.env._t('Paid'),
            })
            this.sepecialFilter.set('done', {
                key: 'done',
                text: this.env._t('Posted'),
            })
            this.sepecialFilter.set('invoiced', {
                key: 'invoiced',
                text: this.env._t('Invoiced'),
            })
            this.sepecialFilter.set('quotation', {
                key: 'quotation',
                text: this.env._t('Quotation (Waiting Payment)'),
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
                this.orders = this.env.pos.db.search_order(searchInput)
            } else {
                this.orders = this.env.pos.db.get_pos_orders()
            }
            if (this.orders.length == 0) {
                let orderObject = this.env.pos.get_model('pos.order');
                let orders = await this.rpc({
                    model: orderObject.model,
                    method: 'search_read',
                    fields: orderObject.fields,
                    domain: ['|', '|', ['name', 'ilike', searchInput], ['pos_reference', 'ilike', searchInput], ['ean13', 'ilike', searchInput]]
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
                    this.env.pos.savePosOrders(orders)
                    orders.forEach(o => {
                        orderIds.push(o.id)
                    })
                    let orderLineObject = this.env.pos.get_model('pos.order.line');
                    let orderLines = await this.rpc({
                        model: orderLineObject.model,
                        method: 'search_read',
                        fields: orderLineObject.fields,
                        args: [[['order_id', 'in', orderIds]]]
                    })
                    this.env.pos.savePosOrderLines(orderLines)
                    const posPaymentObject = this.env.pos.get_model('pos.payment');
                    let paymentLines = await this.rpc({
                        model: posPaymentObject.model,
                        method: 'search_read',
                        fields: posPaymentObject.fields,
                        args: [[['pos_order_id', 'in', orderIds]]]
                    })
                    this.env.pos.savePosPaymentLines(paymentLines)
                    this.orders = this.env.pos.db.search_order(searchInput)
                }
            }
            this.render()

        }

        // TODO: return orders of system
        get orderList() {
            return this.orders
        }
    }

    PosOrderScreen.template = 'PosOrderScreen';

    Registries.Component.add(PosOrderScreen);

    return PosOrderScreen;
});
