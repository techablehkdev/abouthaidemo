odoo.define('pos_retail.PopUpModifierProductAttributes', function (require) {
    'use strict';

    const AbstractAwaitablePopup = require('point_of_sale.AbstractAwaitablePopup');
    const Registries = require('point_of_sale.Registries');
    const NumberBuffer = require('point_of_sale.NumberBuffer');
    const {useListener} = require('web.custom_hooks');

    class PopUpModifierProductAttributes extends AbstractAwaitablePopup {
        constructor() {
            super(...arguments);
            this.changes = {}
            useListener('accept-input', this.confirm);
            useListener('close-this-popup', this.cancel);
            NumberBuffer.use({
                triggerAtEnter: 'accept-input',
                triggerAtEscape: 'close-this-popup',
            });
        }

        OnChange(event) {
            this.changes[event.target.name] = event.target.value;
        }

        getPayload() {
            return this.changes
        }
    }

    PopUpModifierProductAttributes.template = 'PopUpModifierProductAttributes';
    PopUpModifierProductAttributes.defaultProps = {
        confirmText: 'Ok',
        cancelText: 'Cancel',
        array: [],
        isSingleItem: false,
    };

    Registries.Component.add(PopUpModifierProductAttributes);

    return PopUpModifierProductAttributes
});
