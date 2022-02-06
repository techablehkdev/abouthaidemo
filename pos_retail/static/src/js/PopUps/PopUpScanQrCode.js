odoo.define('pos_retail.PopUpScanQrCode', function (require) {
    'use strict';

    const AbstractAwaitablePopup = require('point_of_sale.AbstractAwaitablePopup');
    const Registries = require('point_of_sale.Registries');
    const {posbus} = require('point_of_sale.utils');
    const {useState} = owl.hooks;

    class PopUpScanQrCode extends AbstractAwaitablePopup {
        constructor() {
            super(...arguments);
            this.state = useState({
                codeFound: '',
            });

        }

        mounted() {
            super.mounted()
            this._startCamera()
        }

        _startCamera() {
            const self = this
            let scanner = new Instascan.Scanner({video: document.getElementById('preview')})
            scanner.addListener('scan', function (content) {
                self.state.codeFound = content
                self.confirm()

            })
            Instascan.Camera.getCameras().then(function (cameras) {
                if (cameras.length > 0) {
                    scanner.start(cameras[0]);
                } else {
                    alert('No cameras found.')
                    self.cancel()
                }
            }).catch(function (e) {
                console.error(e);
                alert(e)
                self.cancel()
            })
            this.scanner = scanner
        }


        async confirm() {
            this.scanner.stop()
            await super.confirm()
            if (this.state.codeFound) {
                if (!this.props.isReturn) {
                    posbus.trigger("qr-scanned", this.state.codeFound)
                } else {
                    posbus.trigger("qr-scanned-return", this.state.codeFound)
                }
            }
        }

        async cancel() {
            this.scanner.stop()
            await super.cancel()
        }
    }

    PopUpScanQrCode.template = 'PopUpScanQrCode';

    Registries.Component.add(PopUpScanQrCode);

    PopUpScanQrCode.defaultProps = {
        confirmText: 'Accept',
        cancelText: 'Close',
        title: 'Scanning QrCode'
    };

    return PopUpScanQrCode;
});
