odoo.define('pos_retail.ButtonNotification', function (require) {
    'use strict';

    const PosComponent = require('point_of_sale.PosComponent');
    const ProductScreen = require('point_of_sale.ProductScreen');
    const {useListener} = require('web.custom_hooks');
    const Registries = require('point_of_sale.Registries');
    const field_utils = require('web.field_utils');

    class ButtonNotification extends PosComponent {
        constructor() {
            super(...arguments);
            useListener('click', this.onClick);
        }

        get isHighlighted() {
        }

        get getCount() {
            return this.count;
        }

        get selectedOrderline() {
            return this.env.pos.get_order().get_selected_orderline();
        }

        async onClick() {
            const list = [
                {
                    id: 0,
                    label: this.env._t('List out orders not yet paid full ?'),
                    isSelected: false,
                    item: 0
                },
                {
                    id: 1,
                    label: this.env._t('List out products dead stock ?'),
                    isSelected: false,
                    item: 1
                },
            ]
            let {confirmed, payload: selected} = await this.showPopup('SelectionPopup', {
                title: this.env._t('Please choice one Notification'),
                list: list,
            })
            if (confirmed) {
                if (selected == 0) {
                    this.env.pos.startingNotificationPayment(true)
                }
                if (selected == 1) {
                    this.env.pos.startingNotificationDeadStock(true)
                }
            }
        }
    }

    ButtonNotification.template = 'ButtonNotification';

    ProductScreen.addControlButton({
        component: ButtonNotification,
        condition: function () {
            return true
        },
    });

    Registries.Component.add(ButtonNotification);

    return ButtonNotification;
});
