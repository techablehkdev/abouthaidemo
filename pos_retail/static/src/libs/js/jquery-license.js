odoo.define('pos_retail.license', function (require) {
    const models = require('point_of_sale.models');
    const {Gui} = require('point_of_sale.Gui');

    const _super_PosModel = models.PosModel.prototype;
    models.PosModel = models.PosModel.extend({

        async _registerLicense() {
            let {confirmed, payload: license} = await Gui.showPopup('TextAreaPopup', {
                title: 'Your Database: ' + this.session.db + ' , not yet Register a License. Please input Your License to Text Box, if you have not it, please contact us email thanhchatvn@gmail.com',
                confirmText: 'Register License',
                cancelText: 'Close'
            })
            if (confirmed) {
                let isValid = await this.rpc({
                    model: 'pos.session',
                    method: 'register_license',
                    args: [[], license]
                })
                if (!isValid) {
                    return Gui.showPopup('ErrorPopup', {
                        title: 'Error',
                        body: 'Your License Code is wrong. Please contact us email thanhchatvn@gmail.com',
                        disableCancelButton: true,
                    })
                } else {
                    let {confirmed, payload: license} = await Gui.showPopup('ConfirmPopup', {
                        title: 'Successfully',
                        body: 'License will renew each year. Thanks for use POS All-In-One, if have need support please contact direct us email: thanhchatvn@gmail.com'
                    })
                    location.reload();
                }
            } else {
                return Gui.showPopup('ErrorPopup', {
                    title: 'Trial Version',
                    body: 'Your POS will expired after 30 days from POS All-In-One installed',
                    disableCancelButton: true,
                })
            }
        },

        async _checkLicenseBalanceDays() {
            const balanceDay = await this.rpc({
                model: 'pos.session',
                method: 'check_expired_license',
                args: [[]]
            })
            if (balanceDay >= 350 && balanceDay <= 365) {
                Gui.showPopup('ErrorPopup', {
                    title: 'Warning, Your License will Expired after : ' + (365 - balanceDay) + ' (days).',
                    body: 'Please contact us direct email: thanhchatvn@gmail.com for renew license',
                    disableCancelButton: true,
                })
            }
            if (balanceDay >= 366) {
                Gui.showPopup('ErrorPopup', {
                    title: 'Warning',
                    body: 'License Expired, please Contact Us direct Email: thanchchatvn@gmail.com',
                    disableCancelButton: true,
                })
            }
        },

        async _getLicenseInformation() {
            let session = await this.rpc({
                model: 'pos.session',
                method: 'get_session_online',
                args: [[]]
            })
            if (!session.module_installed && session.session_online >= 4) {
                Gui.showPopup('ErrorPopup', {
                    title: 'Warning',
                    body: 'Standard Version limited maximum 3 POS Sessions online the same time',
                    disableCancelButton: true,
                })
                return window.location = '/web#action=pos_retail.point_of_sale_portal';
            }
            this.license = await this.rpc({
                model: 'pos.session',
                method: 'getExpiredDays',
                args: [[]]
            })
            const isValid = this.license.isValid
            if (!isValid) {
                return this._registerLicense()
            } else {
                return this._checkLicenseBalanceDays()
            }
        },

        async after_load_server_data() {
            let res = await _super_PosModel.after_load_server_data.apply(this, arguments);
            await this._getLicenseInformation()
            return res
        },
    })
})
