odoo.define('pos_retail.PopUpSetGuest', function (require) {
    'use strict';

    const AbstractAwaitablePopup = require('point_of_sale.AbstractAwaitablePopup');
    const Registries = require('point_of_sale.Registries');
    const NumberBuffer = require('point_of_sale.NumberBuffer');
    const {useListener} = require('web.custom_hooks');

    class PopUpSetGuest extends AbstractAwaitablePopup {
        constructor() {
            super(...arguments);
            let order = this.env.pos.get_order();
            this.changes = {
                guest: order.guest || '',
                guest_number: order.guest_number || 0,
            }
            useListener('accept-input', this.confirm);
            useListener('close-this-popup', this.cancel);
            NumberBuffer.use({
                triggerAtEnter: 'accept-input',
                triggerAtEscape: 'close-this-popup',
            });
        }

        OnChange(event) {
            let target_name = event.target.name;
            this.changes[event.target.name] = event.target.value;
        }

        getPayload() {
            return this.changes
        }
    }

    PopUpSetGuest.template = 'PopUpSetGuest';
    PopUpSetGuest.defaultProps = {
        confirmText: 'Ok',
        cancelText: 'Cancel',
        array: [],
        isSingleItem: false,
    };

    Registries.Component.add(PopUpSetGuest);

    return PopUpSetGuest
});
