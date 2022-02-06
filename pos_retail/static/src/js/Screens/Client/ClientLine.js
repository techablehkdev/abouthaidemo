odoo.define('pos_retail.ClientLine', function (require) {
    'use strict';

    const ClientLine = require('point_of_sale.ClientLine');
    const {useListener} = require('web.custom_hooks');
    const Registries = require('point_of_sale.Registries');
    const {posbus} = require('point_of_sale.utils');
    const bus = require('pos_retail.core_bus');
    ClientLine.template = 'RetailClientLine';

    const RetailClientLine = (ClientLine) =>
        class extends ClientLine {
            constructor() {
                super(...arguments);
                useListener('set-message', this.sendMessage);
                this.intFields = ['title', 'country_id', 'state_id', 'property_product_pricelist', 'id'];
            }

            mounted() {
                super.mounted();
                posbus.on('reload.client.line', this, this._updateCustomer)
                this.startPolling()
            }

            willUnmount() {
                super.willUnmount();
                posbus.off('reload.client.line', this, null)
            }

            startPolling() {
                this.bus = bus.bus
                this.bus.last = 0
                this.bus.on("notification", this, this._busNotification);
                this.bus.start_polling();
            }

            async _busNotification(notifications) {
                if (notifications && notifications[0] && notifications[0][1]) {
                    const type = notifications[0][1]['type']
                    const payload = notifications[0][1]['payload']
                    if (type == "bus.sync.partner" && payload.partner_ids.indexOf(this.props.partner.id) != -1) {
                        console.warn('!!! event on_notification()')
                        console.log(type)
                        console.log(payload)
                        const partners = await this.env.pos.getDatasByModel('res.partner', [['id', 'in', payload.partner_ids]])
                        if (partners.length > 0) {
                            this.env.pos.update_indexDB('res.partner', partners)
                        }
                    }
                }
            }

            _updateCustomer(partner_id) {
                if (partner_id == this.props.partner.id) {
                    let partner = this.env.pos.db.get_partner_by_id(partner_id)
                    this.props.partner = partner
                    this.render()
                }
            }

            async editCustomer() {
                let {confirmed, payload: results} = await this.showPopup('PopUpCreateCustomer', {
                    title: this.env._t('Update Informaton of ') + this.props.partner.name,
                    partner: this.props.partner
                })
                if (confirmed) {
                    if (results.error) {
                        return this.showPopup('ErrorPopup', {
                            title: this.env._t('Error'),
                            body: results.error
                        })
                    }
                    const partnerValue = {
                        'name': results.name,
                    }
                    if (results.image_1920) {
                        partnerValue['image_1920'] = results.image_1920.split(',')[1]
                    }
                    if (results.title) {
                        partnerValue['title'] = results.title
                    }
                    if (!results.title && this.env.pos.partner_titles) {
                        partnerValue['title'] = this.env.pos.partner_titles[0]['id']
                    }
                    if (results.street) {
                        partnerValue['street'] = results.street
                    }
                    if (results.city) {
                        partnerValue['city'] = results.city
                    }
                    if (results.street) {
                        partnerValue['street'] = results.street
                    }
                    if (results.phone) {
                        partnerValue['phone'] = results.phone
                    }
                    if (results.mobile) {
                        partnerValue['mobile'] = results.mobile
                    }

                    if (results.birthday_date) {
                        partnerValue['birthday_date'] = results.birthday_date
                    }
                    if (results.barcode) {
                        partnerValue['barcode'] = results.barcode
                    }
                    if (results.comment) {
                        partnerValue['comment'] = results.comment
                    }
                    if (results.property_product_pricelist) {
                        partnerValue['property_product_pricelist'] = results.property_product_pricelist
                    } else {
                        partnerValue['property_product_pricelist'] = null
                    }
                    if (results.country_id) {
                        partnerValue['country_id'] = results.country_id
                    }
                    let valueWillSave = {}
                    for (let [key, value] of Object.entries(partnerValue)) {
                        if (this.intFields.includes(key)) {
                            valueWillSave[key] = parseInt(value) || false;
                        } else {
                            if ((key == 'birthday_date' && value != this.props.partner.birthday_date) || key != 'birthday_date') {
                                valueWillSave[key] = value;
                            }
                        }
                    }
                    await this.rpc({
                        model: 'res.partner',
                        method: 'write',
                        args: [[this.props.partner.id], valueWillSave],
                        context: {}
                    })
                    this.env.pos._syncPartners()
                }
            }

            async _autoSyncBackend() {
                if (!this.env.pos.config.sync_partners_realtime || this.env.pos.networkCrashed) {
                    return true
                }
                const partners = await this.env.pos.getDatasByModel('res.partner', [['id', '=', this.props.partner.id]])
                if (partners.length > 0) {
                    this.env.pos.update_indexDB('res.partner', partners)
                } else {
                    this.env.pos._syncPartners()
                }
            }

            async showPurchasedHistories() {
                const {confirmed, payload: result} = await this.showTempScreen(
                    'PosOrderScreen',
                    {
                        order: null,
                        selectedClient: this.props.partner
                    }
                );
            }

            async reChargePoints() {
                let {confirmed, payload: newPoints} = await this.showPopup('NumberPopup', {
                    title: this.props.partner['name'] + this.env._t(' have total points: ') + this.env.pos.format_currency_no_symbol(this.props.partner['pos_loyalty_point']) + this.env._t(' How many points need ReCharge ?'),
                    startingValue: 0
                })
                if (confirmed) {
                    this.props.partner['pos_loyalty_point']
                    await this.rpc({
                        model: 'res.partner',
                        method: 'write',
                        args: [[this.props.partner.id], {
                            'pos_loyalty_point_import': newPoints
                        }],
                    })
                    await this.env.pos._syncPartners()
                }
            }

            showMore() {
                const partner = this.props.partner;
                const link = window.location.origin + '/web#id=' + partner.id + '&view_type=form&model=res.partner'
                window.open(link, '_blank')
            }

            async archiveClient() {
                let {confirmed, payload: result} = await this.showPopup('ConfirmPopup', {
                    title: this.env._t('Warning'),
                    body: this.env._t('Are you want move customer to Black List, this customer will not display in this Screen if you refresh POS Page')
                })
                if (confirmed) {
                    await this.rpc({
                        model: 'res.partner',
                        method: 'write',
                        args: [[this.props.partner.id], {
                            active: false,
                        }],
                    })
                    await this.env.pos._syncPartners()
                    this.showPopup('ConfirmPopup', {
                        title: this.props.partner.name + this.env._t(' moved to BlackList Customers (active is False)'),
                        body: this.env._t('You can reload POS page, all clients Active is false will not display in this Screen')
                    })
                }
            }

            async addBarcode() {
                let newBarcode = await this.rpc({ // todo: template rpc
                    model: 'res.partner',
                    method: 'add_barcode',
                    args: [[this.props.partner.id]]
                })
                if (newBarcode) {
                    await this.env.pos._syncPartners()
                }
            }

            async printBarcode() {
                await this.env.pos.do_action('pos_retail.res_partner_card_badge', {
                    additional_context: {
                        active_id: this.props.partner.id,
                        active_ids: [this.props.partner.id],
                    }
                }, {
                    shadow: true,
                    timeout: 6500
                });
            }

            get CountAllPricelist() {
                return this.env.pos.pricelists.length
            }

            async changePricelist() {
                const list = this.env.pos.pricelists.map(p => ({
                    id: p.id,
                    label: p.name,
                    item: p
                }))
                let {confirmed, payload: pricelist} = await this.showPopup('SelectionPopup', {
                    title: this.env._t('What Pricelist need update for ') + this.props.partner.name,
                    list: list,
                })
                if (confirmed) {
                    await this.rpc({
                        model: 'res.partner',
                        method: 'write',
                        args: [[this.props.partner.id], {
                            'property_product_pricelist': pricelist.id
                        }],
                    })
                    await this.env.pos._syncPartners()
                    this.showPopup('ConfirmPopup', {
                        title: this.env._t('Successfully'),
                        body: this.props.partner.name + this.env._t(' Successfully Change to Pricelist : ') + pricelist.name
                    })
                }
            }

            async sendMessage(selectedClient) {
                if (!selectedClient['mobile'] && !selectedClient['phone']) {
                    return this.env.pos.alert_message({
                        title: this.env._t('Warning'),
                        body: this.env._t('Customer missed Mobile and Phone, it not possible send message via WhatsApp')
                    })
                } else {
                    let startingValue = this.env._t('Dear ') + selectedClient.name + '\n';
                    startingValue += this.env._t('---- *** This is your account information *** ------ \n');
                    startingValue += this.env._t('You have Total Loyalty Points: ') + this.env.pos.format_currency_no_symbol(selectedClient.pos_loyalty_point) + '\n';
                    startingValue += this.env._t('With Credit Points: ') + this.env.pos.format_currency_no_symbol(selectedClient.balance) + '\n';
                    startingValue += this.env._t('With Wallet Points: ') + this.env.pos.format_currency_no_symbol(selectedClient.wallet) + '\n';
                    startingValue += this.env._t('-------- \n');
                    startingValue += this.env._t('Thanks you for choice our services.');
                    let {confirmed, payload: messageNeedSend} = await this.showPopup('TextAreaPopup', {
                        title: this.env._t('What message need to send Client ?'),
                        startingValue: startingValue
                    })
                    if (confirmed) {
                        let mobile_no = selectedClient['phone'] || selectedClient['mobile']
                        let message = messageNeedSend
                        let responseOfWhatsApp = await this.rpc({
                            model: 'pos.config',
                            method: 'send_message_via_whatsapp',
                            args: [[], this.env.pos.config.id, mobile_no, message],
                        });
                        if (responseOfWhatsApp && responseOfWhatsApp['id']) {
                            return this.showPopup('ConfirmPopup', {
                                title: this.env._t('Successfully'),
                                body: this.env._t("Send successfully message to your Client's Phone WhatsApp: ") + mobile_no,
                                disableCancelButton: true,
                            })
                        } else {
                            return this.env.pos.alert_message({
                                title: this.env._t('Error'),
                                body: this.env._t("Send Message is fail, please check WhatsApp API and Token of your pos config or Your Server turn off Internet"),
                                disableCancelButton: true,
                            })
                        }
                    }
                }
            }

            get countOrdersByClient() {
                if (this.env.pos.db.order_by_partner_id[this.props.partner.id]) {
                    return this.env.pos.db.order_by_partner_id[this.props.partner.id].length
                } else {
                    return 0
                }
            }
        }
    Registries.Component.extend(ClientLine, RetailClientLine);

    return RetailClientLine;
});
