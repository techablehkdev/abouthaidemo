odoo.define('pos_retail.ButtonRestoreOrder', function (require) {
    'use strict';

    const PosComponent = require('point_of_sale.PosComponent');
    const ProductScreen = require('point_of_sale.ProductScreen');
    const {useListener} = require('web.custom_hooks');
    const Registries = require('point_of_sale.Registries');
    const models = require('point_of_sale.models');

    class ButtonRestoreOrder extends PosComponent {
        constructor() {
            super(...arguments);
            useListener('click', this.onClick);
        }

        async onClick() {
            const {confirmed, payload} = await this.showPopup('TextInputPopup', {
                title: this.env._t('Type Ean13 or Receipt Number of Order to Input box for restore Order '),
                startingValue: '',
                confirmText: this.env._t('Check'),
                cancelText: this.env._t('Close'),
            });
            if (confirmed) {
                let key = payload
                if (key) {
                    let order = await this.env.pos.rpc({
                        model: 'pos.order.json',
                        method: 'get_order',
                        args: [key],
                    })
                    if (!order) {
                        return this.showPopup('ErrorPopup', {
                            title: this.env._t('Warning'),
                            body: this.env._t('Not found any order with your input. Please checking and remove space, make sure correct your type'),
                        })
                    } else {
                        let orders = this.env.pos.get('orders');
                        let restoreOrder = new models.Order({}, {pos: this.env.pos, temporary: true, json: order})
                        orders.add(restoreOrder)
                        restoreOrder.trigger('change', restoreOrder)
                        this.env.pos.set('selectedOrder', restoreOrder)
                        return this.showPopup('ConfirmPopup', {
                            title: this.env._t('Order Restored'),
                            body: this.env._t('You can Re-Print Order, order will Lose when you submit to Backend.')
                        })
                    }
                } else {
                    return this.showPopup('ErrorPopup', {
                        title: this.env._t('Warning'),
                        body: this.env._t('Not found any order with your input. Please checking and remove space, make sure correct your type'),
                    })
                }
            }
        }
    }

    ButtonRestoreOrder.template = 'ButtonRestoreOrder';

    ProductScreen.addControlButton({
        component: ButtonRestoreOrder,
        condition: function () {
            return true
        },
    });

    Registries.Component.add(ButtonRestoreOrder);

    return ButtonRestoreOrder;
})
;
