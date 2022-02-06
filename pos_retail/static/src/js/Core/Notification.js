/*
    This module create by: thanhchatvn@gmail.com
    License: OPL-1
    Please do not modification if i'm not accepted
 */
odoo.define('pos_retail.notification', function (require) {

    const models = require('point_of_sale.models');
    const utils = require('web.utils');
    const core = require('web.core');
    const _t = core._t;
    const rpc = require('pos.rpc');
    const {Gui} = require('point_of_sale.Gui');

    const _super_PosModel = models.PosModel.prototype;
    models.PosModel = models.PosModel.extend({

        async startingNotificationDeadStock(reCall) {
            let self = this;
            console.log('startingNotificationDeadStock')
            const products = await rpc.query({
                model: 'pos.config',
                method: 'startingNotificationDeadStock',
                args: [[], this.config.id]
            }).then(function (products) {
                return products
            }, function (err) {
                if (!reCall) {
                    setTimeout(_.bind(self.startingNotificationDeadStock, self), self.config.notification_dead_stock * 60 * 1000);
                }
            })
            const list = []
            products.forEach(p => {
                list.push({
                    id: p.id,
                    label: p.name,
                    isSelected: false,
                    item: p
                })

            })
            let {confirmed, payload: product} = await Gui.showPopup('SelectionPopup', {
                title: _t('List of Products dead stock'),
                list: list,
            })
            if (confirmed) {
                const link = window.location.origin + "/web#id=" + product.id + "&view_type=form&model=product.product"
                window.open(link, '_blank')
            }
            if (!reCall) {
                setTimeout(_.bind(self.startingNotificationDeadStock, self), self.config.notification_dead_stock * 60 * 1000)
            }

        },

        async startingNotificationPayment(reCall) {
            let self = this;
            console.log('startingNotificationPayment')
            const orders = await rpc.query({
                model: 'pos.config',
                method: 'startingNotificationPayment',
                args: [[], this.config.id]
            }, {
                shadow: true,
                timeout: 60000
            }).then(function (orders) {
                return orders
            }, function (err) {
                if (!reCall) {
                    setTimeout(_.bind(self.startingNotificationPayment, self), self.config.notification_payment_time * 60 * 1000);
                }
            })
            if (orders) {
                const list = []
                orders.forEach(o => {
                    let label = _t('Ean13: ') + o.ean13
                    if (o.pos_reference) {
                        label += _t(' Receipt Number : ') + o.pos_reference
                    }
                    label += _t(' with total Amount ') + this.format_currency(o.amount_total - o.amount_paid)
                    list.push({
                        id: o.id,
                        label: label,
                        isSelected: false,
                        item: o
                    })

                })
                if (orders.length > 0) {
                    let {confirmed, payload: order} = await Gui.showPopup('SelectionPopup', {
                        title: _t('List of Orders not yet Paid full'),
                        list: list,
                    })
                    if (confirmed) {
                        const link = window.location.origin + "/web#id=" + order.id + "&view_type=form&model=pos.order"
                        window.open(link, '_blank')
                    }
                }
            }
            if (!reCall) {
                setTimeout(_.bind(self.startingNotificationPayment, self), self.config.notification_payment_time * 60 * 1000);
            }

        },

        startingNotification: function () {
            if (this.config.notification_payment_time > 0) {
                setTimeout(_.bind(this.startingNotificationPayment, this), this.config.notification_payment_time * 60 * 1000);
            }
            if (this.config.notification_dead_stock > 0) {
                setTimeout(_.bind(this.startingNotificationDeadStock, this), this.config.notification_dead_stock * 60 * 1000);
            }
        },

        async after_load_server_data() {
            console.log('after_load_server_data notification')
            let res = await _super_PosModel.after_load_server_data.apply(this, arguments)
            this.startingNotification()
            return res
        },

    })

})