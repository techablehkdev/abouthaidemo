odoo.define('pos_retail.ClientListScreen', function (require) {
    'use strict';

    const ClientListScreen = require('point_of_sale.ClientListScreen');
    const {useListener} = require('web.custom_hooks');
    const Registries = require('point_of_sale.Registries');
    const {posbus} = require('point_of_sale.utils');
    const NumberBuffer = require('point_of_sale.NumberBuffer');
    const {useState} = owl.hooks;

    const RetailClientListScreen = (ClientListScreen) =>
        class extends ClientListScreen {
            constructor() {
                super(...arguments);
                useListener('show-reference-contact', () => this.showReferenceAddress());
                useListener('clear-search', () => this.clearSearch());
                useListener('set-customer-to-cart', this.setCustomerToCart);
                NumberBuffer.use({
                    triggerClientScreen: 'trigger-client-screen',
                });
                useListener('trigger-client-screen', this._keyboardHandler);
                this.status = useState({
                    sort_field: null,
                    reverse: true
                })
            }

            _sortField(fieldSort, int = false) {
                this.status.sort_field = fieldSort
                this.status.reverse = !this.status.reverse
                this.status.sortInt = int
            }


            confirm() { // single screen
                try {
                    super.confirm()
                } catch (ex) {
                    const selectedOrder = this.env.pos.get_order();
                    selectedOrder.set_client(this.state.selectedClient)
                    posbus.trigger('reset-screen')
                }
            }

            back() { // single screen
                try {
                    super.back()
                } catch (ex) {
                    posbus.trigger('reset-screen')
                }
            }

            clearSearch() {
                this.state.query = null
                this.render()
            }

            setCustomerToCart(event) {
                const selectedClient = event.detail.client;
                const selectedOrder = this.env.pos.get_order();
                if (!selectedOrder || (selectedOrder && selectedOrder['finalized'])) {
                    this.props.resolve({confirmed: true, payload: selectedClient});
                    return this.trigger('close-temp-screen');
                }
                if (selectedClient && selectedOrder) {
                    selectedOrder.set_client(selectedClient)
                    try {
                        this.props.resolve({confirmed: true, payload: selectedClient});
                        this.trigger('close-temp-screen');
                    } catch (ex) {

                    }
                    posbus.trigger('reset-screen')
                }
            }

            async showReferenceAddress() {
                const selectedClient = this.state.selectedClient;
                if (selectedClient) {
                    const customersReference = this.env.pos.db.partners_by_parent_id[selectedClient.id]
                    this.customersReference = customersReference;
                    this.render()
                }
            }

            get clients() {
                let clients = super.clients
                if (this.customersReference) {
                    clients = this.customersReference
                    this.customersReference = null
                }
                if (this.status.sort_field) {
                    if (this.status.sortInt) {
                        clients = clients.sort(this.env.pos.sort_by(this.status.sort_field, this.status.reverse, parseInt))
                    } else {
                        clients = clients.sort(this.env.pos.sort_by(this.status.sort_field, this.status.reverse, function (a) {
                            if (!a) {
                                a = 'N/A'
                            }
                            return a.toUpperCase()
                        }))
                    }
                }
                return clients
            }

            _keyboardHandler() {
                const keyName = event.detail.key
                console.log('[ Key enter ] : ' + keyName)
                if (keyName == "ArrowRight" || keyName == "Enter") {
                    const query = $('.searchbox-client >input').val();
                    const partners = this.env.pos.db.search_partner(query)
                    if (partners.length == 1) {
                        $(this.el).find('.searchbox-client >input').blur()
                        $(this.el).find('.searchbox-client >input')[0].value = "";
                        this.props.resolve({confirmed: true, payload: partners[0]});
                        this.trigger('close-temp-screen');
                    }
                    $(this.el).find('.save').click()
                    $(this.el).find('.next').click()
                }
                if (keyName == "l") {
                    $('.close_button').click()
                }
                if (keyName == "b" || keyName == "Escape") {
                    $(this.el).find('.back').click()
                }
                if (keyName == "e") {
                    $(this.el).find('.edit-client-button').click()
                }
                if (keyName == "ArrowUp" || keyName == "ArrowDown") {
                    const selectedClient = this.state.selectedClient;
                    let clients = [];
                    if (this.state.query && this.state.query.trim() !== '') {
                        clients = this.env.pos.db.search_partner(this.state.query.trim());
                    } else {
                        clients = this.env.pos.db.get_partners_sorted(1000);
                    }
                    if (clients.length != 0) {
                        if (!selectedClient) {
                            this.state.selectedClient = clients[[0]];
                            this.render();
                        } else {
                            let isSelected = false
                            for (let i = 0; i < clients.length; i++) {
                                let client = clients[i]
                                if (client.id == selectedClient.id) {
                                    let line_number = null;
                                    if (keyName == "ArrowUp") {
                                        if (i == 0) {
                                            line_number = clients.length - 1
                                        } else {
                                            line_number = i - 1
                                        }
                                    } else {
                                        if (i + 1 >= clients.length) {
                                            line_number = 0
                                        } else {
                                            line_number = i + 1
                                        }
                                    }
                                    if (clients[line_number]) {
                                        this.state.selectedClient = clients[line_number];
                                        this.render();
                                        isSelected = true
                                        break
                                    }
                                }
                            }
                            if (!isSelected) {
                                this.state.selectedClient = clients[0];
                                this.render();
                            }
                        }
                    }
                }
            }

            activateEditMode(event) {
                if (!this.env.pos.config.add_client) {
                    return this.env.pos.alert_message({
                        title: this.env._t('Error'),
                        body: this.env._t('You have not permission create new Customer ! You can request admin go to your pos setting / Clients Screen [Tab] / Security and check to field [Allow add client]')
                    })
                }
                super.activateEditMode(event)
                if (event.detail['parent_id']) {
                    this.state.editModeProps['partner']['parent_id'] = event.detail['parent_id'] // todo: send this to ClientDetailsEdit.js for saveChange can get it
                }
            }

            async saveChanges(event) {
                if (this.env.pos.networkCrashed) {
                    this.showPopup('ErrorPopup', {
                        title: _t('Offline'),
                        body: _t('Unable to save customer.'),
                    })
                    return false
                }
                let partnerId = await this.rpc({
                    model: 'res.partner',
                    method: 'create_from_ui',
                    args: [event.detail.processedChanges],
                })
                if (partnerId) {
                    await this.env.pos._syncPartners()
                    let newPartner = this.env.pos.db.get_partner_by_id(partnerId)
                    if (newPartner) {
                        this.state.selectedClient = this.env.pos.db.get_partner_by_id(partnerId)
                        this.state.detailIsShown = false
                    }
                }
            }
        }
    Registries.Component.extend(ClientListScreen, RetailClientListScreen);

    return ClientListScreen;
});
