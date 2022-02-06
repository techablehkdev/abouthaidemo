odoo.define('pos_retail.PopUpCreatePurchaseOrder', function (require) {
    'use strict';

    const {useState, useContext} = owl.hooks;
    const AbstractAwaitablePopup = require('point_of_sale.AbstractAwaitablePopup');
    const Registries = require('point_of_sale.Registries');
    const contexts = require('point_of_sale.PosContext');
    const NumberBuffer = require('point_of_sale.NumberBuffer');
    const {useListener} = require('web.custom_hooks');

    class PopUpCreatePurchaseOrder extends AbstractAwaitablePopup {
        constructor() {
            super(...arguments);
            this.changes = {
                note: this.props.note,
                currency_id: this.props.currency_id,
                date_planned: this.props.date_planned,
            }
            this.state = useState(this.change);
            this.orderUiState = useContext(contexts.orderManagement);
            useListener('accept-input', this.confirm);
            useListener('close-this-popup', this.cancel);
            NumberBuffer.use({
                triggerAtEnter: 'accept-input',
                triggerAtEscape: 'close-this-popup',
            });
        }

        OnChange(event) {
            if (event.target.type == 'checkbox') {
                this.changes[event.target.name] = event.target.checked;
            } else {
                this.changes[event.target.name] = event.target.value;
            }
            this.render()
        }


        getPayload() {
            if (this.orderUiState.isSuccessful) {
                return {
                    values: this.changes
                };
            } else {
                return {
                    values: this.changes,
                    error: this.orderUiState.hasNotice
                };
            }

        }
    }

    PopUpCreatePurchaseOrder.template = 'PopUpCreatePurchaseOrder';
    PopUpCreatePurchaseOrder.defaultProps = {
        confirmText: 'Ok',
        cancelText: 'Cancel',
        array: [],
        isSingleItem: false,
    };

    Registries.Component.add(PopUpCreatePurchaseOrder);

    return PopUpCreatePurchaseOrder
});
