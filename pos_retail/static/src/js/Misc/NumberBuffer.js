odoo.define('pos_retail.NumberBuffer', function (require) {
    const {Component} = owl;
    const NumberBuffer = require('point_of_sale.NumberBuffer');
    const {onMounted, onWillUnmount, useExternalListener} = owl.hooks;
    const {useListener} = require('web.custom_hooks');
    const getDefaultConfig = () => ({
        decimalPoint: false,
        triggerAtEnter: false,
        triggerAtEsc: false,
        triggerAtInput: false,
        nonKeyboardInputEvent: false,
        useWithBarcode: false,
    });

    const DENY_KEYS_BARCODE_SCANNER = '0123456789'.split('')

    // TODO: Any key not support by Odoo, will support by ME (thanhchatvn@gmail.com)

    NumberBuffer._onKeyboardInput = function (event) {
        const userHasInput = ['INPUT', 'TEXTAREA'].includes(event.target.tagName)
        const key = event.key
        const keyIncluded = DENY_KEYS_BARCODE_SCANNER.includes(key)
        if (this.config && this.config.triggerProductScreen && !userHasInput && !keyIncluded) {
            this.component.trigger(this.config.triggerProductScreen, {buffer: this.state.buffer, key});
        }
        if (this.config && this.config.triggerClientScreen && !userHasInput && !keyIncluded) {
            this.component.trigger(this.config.triggerClientScreen, {buffer: this.state.buffer, key});
        }
        if (this.config && this.config.triggerPaymentScreen && !userHasInput && !keyIncluded) {
            this.component.trigger(this.config.triggerPaymentScreen, {buffer: this.state.buffer, key});
        }
        if (this.config && this.config.triggerReceiptScreen && !userHasInput && !keyIncluded) {
            this.component.trigger(this.config.triggerReceiptScreen, {buffer: this.state.buffer, key});
        }
        if (this.config && this.config.triggerTicketScreen && !userHasInput && !keyIncluded) {
            this.component.trigger(this.config.triggerTicketScreen, {buffer: this.state.buffer, key});
        }
        if (this.config && this.config.triggerReportScreen && !userHasInput && !keyIncluded) {
            this.component.trigger(this.config.triggerReportScreen, {buffer: this.state.buffer, key});
        }
        return this._bufferEvents(this._onInput(event => event.key))(event);
    }

    NumberBuffer.use = function (config) {
        this.eventsBuffer = [];
        const currentComponent = Component.current;
        config = Object.assign(getDefaultConfig(), config);
        onMounted(() => {
            this.bufferHolderStack.push({
                component: currentComponent,
                state: config.state ? config.state : {buffer: '', toStartOver: false},
                config,
            });
            this._setUp();
        });
        onWillUnmount(() => {
            this.bufferHolderStack.pop();
            this._setUp();
        });
        // TODO: only one time register event nonKeyboardInputEvent
        if (typeof config.nonKeyboardInputEvent === 'string' && !currentComponent['nonKeyboardInputEvent']) {
            currentComponent['nonKeyboardInputEvent'] = config.nonKeyboardInputEvent
            useListener(config.nonKeyboardInputEvent, this._onNonKeyboardInput.bind(this));
        }
    }
});
