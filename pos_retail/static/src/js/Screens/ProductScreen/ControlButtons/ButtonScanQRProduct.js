odoo.define('pos_retail.ButtonScanQRProduct', function (require) {
    'use strict';

    const PosComponent = require('point_of_sale.PosComponent');
    const ProductScreen = require('point_of_sale.ProductScreen');
    const {useListener} = require('web.custom_hooks');
    const Registries = require('point_of_sale.Registries');
    const {useState} = owl.hooks;
    const {posbus} = require('point_of_sale.utils');

    class ButtonScanQRProduct extends PosComponent {
        constructor() {
            super(...arguments);
            useListener('click', this.onClick)
            this.state = useState({
                codeFound: '',
                cameraOpen: null
            })
        }

        mounted() {
            super.mounted()
            posbus.on('stop-video', this, this._stopVideo)
        }

        _stopVideo() {
            if (this.state.cameraOpen) {
                $('.scanQrCode').addClass('oe_hidden')
                this.state.cameraOpen = null
                return this.scanner.stop()
            }
        }

        willUnmount() {
            super.willUnmount()
            if (this.scanner) {
                $('.scanQrCode').addClass('oe_hidden')
                this.scanner.stop()
            }
        }

        async onClick() {
            if (this.state.cameraOpen) {
                $('.scanQrCode').addClass('oe_hidden')
                this.state.cameraOpen = null
                return this.scanner.stop()
            }
            $('.scanQrCode').removeClass('oe_hidden')
            const self = this
            let scanner = new Instascan.Scanner({video: document.getElementById('scanQrCode')})
            scanner.addListener('scan', function (content) {
                self.state.codeFound = content
                console.log('found code: ' + content)
                posbus.trigger('scan-qrcode-product', content)
            })
            Instascan.Camera.getCameras().then(function (cameras) {
                if (cameras.length > 0) {
                    scanner.start(cameras[0]);
                } else {
                    self.showPopup('ErrorPopup', {
                        title: self.env._t('Camera not found'),
                        body: self.env._t('Please make sure Camera Device is ready and Odoo hosting on https (SSL)')
                    })
                    self.scanner.stop()
                }
            }).catch(function (e) {
                self.showPopup('ErrorPopup', {
                    title: e,
                    body: self.env._t('Please make sure Camera Device is ready and Odoo hosting on https (SSL)')
                })
                self.scanner.stop()
            })
            this.state.cameraOpen = true
            this.scanner = scanner
        }
    }

    ButtonScanQRProduct.template = 'ButtonScanQRProduct';

    ProductScreen.addControlButton({
        component: ButtonScanQRProduct,
        condition: function () {
            return true
        },
    });

    Registries.Component.add(ButtonScanQRProduct);

    return ButtonScanQRProduct;
});
