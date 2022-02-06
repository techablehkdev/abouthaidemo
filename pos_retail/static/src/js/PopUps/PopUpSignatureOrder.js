odoo.define('pos_retail.PopUpSignatureOrder', function (require) {
    'use strict';

    const {useState, useRef, useContext} = owl.hooks;
    const AbstractAwaitablePopup = require('point_of_sale.AbstractAwaitablePopup');
    const Registries = require('point_of_sale.Registries');
    const NumberBuffer = require('point_of_sale.NumberBuffer');
    const { useListener } = require('web.custom_hooks');

    class PopUpSignatureOrder extends AbstractAwaitablePopup {
        constructor() {
            super(...arguments);
            this.changes = {
                signature: null
            }
            let order = this.props.order;
            this.state = useState({
                order: order,
            });
            useListener('accept-input', this.confirm);
            useListener('close-this-popup', this.cancel);
            NumberBuffer.use({
                triggerAtEnter: 'accept-input',
                triggerAtEscape: 'close-this-popup',
            });
        }

        mounted() {
            var self = this;
            $(this.el).find(".signature").jSignature();
            this.signed = false;
            $(this.el).find(".signature").bind('change', function (e) {
                self.OnChange();
            });
        }

        OnChange(event) {
            let changes = this.changes;
            var sign_datas = $(this.el).find(".signature").jSignature("getData", "image");
            if (sign_datas && sign_datas[1]) {
                changes['signature'] = sign_datas[1];
            }
        }

        getPayload() {
            this.OnChange();
            return {
                signature: this.changes['signature']
            };
        }
    }

    PopUpSignatureOrder.template = 'PopUpSignatureOrder';
    PopUpSignatureOrder.defaultProps = {
        confirmText: 'Ok',
        cancelText: 'Cancel',
        array: [],
        isSingleItem: false,
    };

    Registries.Component.add(PopUpSignatureOrder);

    return PopUpSignatureOrder
});
