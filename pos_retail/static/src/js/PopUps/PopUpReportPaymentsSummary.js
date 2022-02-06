odoo.define('pos_retail.PopUpReportPaymentsSummary', function (require) {
    'use strict';

    const {useState, useRef, useContext} = owl.hooks;
    const AbstractAwaitablePopup = require('point_of_sale.AbstractAwaitablePopup');
    const Registries = require('point_of_sale.Registries');
    const contexts = require('point_of_sale.PosContext');
    const NumberBuffer = require('point_of_sale.NumberBuffer');
    const {useListener} = require('web.custom_hooks');

    class PopUpReportPaymentsSummary extends AbstractAwaitablePopup {
        constructor() {
            super(...arguments);
            this.changes = {
                current_session_report: this.props.current_session_report || false,
                from_date: this.props.from_date,
                to_date: this.props.to_date,
                summary: this.props.summary,
            }
            this.state = useState(this.changes);
            this.orderUiState = useContext(contexts.orderManagement);
            useListener('accept-input', this.confirm);
            useListener('close-this-popup', this.cancel);
            NumberBuffer.use({
                triggerAtEnter: 'accept-input',
                triggerAtEscape: 'close-this-popup',
            });
        }

        get isHidden() {
            return this.state.current_session_report;
        }

        OnChange(event) {
            if (event.target.type == 'checkbox') {
                this.changes[event.target.name] = event.target.checked;
            } else {
                this.changes[event.target.name] = event.target.value;
            }
            this.props.current_session_report = this.changes.current_session_report;
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

    PopUpReportPaymentsSummary.template = 'PopUpReportPaymentsSummary';
    PopUpReportPaymentsSummary.defaultProps = {
        confirmText: 'Ok',
        cancelText: 'Cancel',
        array: [],
        isSingleItem: false,
    };

    Registries.Component.add(PopUpReportPaymentsSummary);

    return PopUpReportPaymentsSummary
});
