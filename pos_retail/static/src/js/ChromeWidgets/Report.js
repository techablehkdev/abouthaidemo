odoo.define('point_of_sale.Report', function (require) {
    'use strict';

    const PosComponent = require('point_of_sale.PosComponent');
    const Registries = require('point_of_sale.Registries');
    const core = require('web.core');
    const qweb = core.qweb;

    class Report extends PosComponent {
        constructor() {
            super(...arguments);
        }

        async onClick() {
            await this.showReports()
        }

        async showReports() {
            let self = this;
            let list_report = [];
            if (this.env.pos.config.report_product_summary) {
                list_report.push({
                    'id': 1,
                    'name': 'Report Products Summary',
                    'item': 1
                })
            }
            if (this.env.pos.config.report_order_summary) {
                list_report.push({
                    'id': 2,
                    'name': 'Report Orders Summary',
                    'item': 2
                })
            }
            if (this.env.pos.config.report_payment_summary) {
                list_report.push({
                    'id': 3,
                    'name': 'Payments Summary',
                    'item': 3
                })
            }
            if (this.env.pos.config.report_sale_summary) {
                list_report.push({
                    'id': 4,
                    'name': 'Z-Report (Your Session Sale Summary)',
                    'item': 4
                })
            }
            list_report.push({
                'id': 5,
                'name': 'Sale Summary Detail of your Session',
                'item': 5
            })
            var to_date = new Date().toISOString().split('T')[0];
            var date = new Date();
            var firstDay = new Date(date.getFullYear(), date.getMonth(), 1);
            var from_date = firstDay.toISOString().split('T')[0];
            let {confirmed, payload: selectedReports} = await this.showPopup(
                'PopUpSelectionBox',
                {
                    title: this.env._t('Select the report'),
                    items: list_report,
                    onlySelectOne: true,
                }
            );
            if (confirmed && selectedReports['items'].length > 0) {
                const selectedReport = selectedReports['items'][0]
                if (selectedReport && selectedReport['id']) {
                    const report_id = selectedReport['id']
                    if (report_id == 1) {
                        let defaultProps = {
                            title: this.env._t('Products Summary Report'),
                            current_session_report: true,
                            from_date: from_date,
                            to_date: to_date,
                            report_product_summary_auto_check_product: this.env.pos.config.report_product_summary_auto_check_product,
                            report_product_summary_auto_check_category: this.env.pos.config.report_product_summary_auto_check_category,
                            report_product_summary_auto_check_location: this.env.pos.config.report_product_summary_auto_check_location,
                            report_product_summary_auto_check_payment: this.env.pos.config.report_product_summary_auto_check_payment,
                        }
                        let {
                            confirmed,
                            payload: result
                        } = await this.showPopup('PopUpReportProductsSummary', defaultProps)
                        if (confirmed) {
                            this.buildProductsSummaryReport(result.values);
                        }
                    }
                    if (report_id == 2) {
                        let defaultProps = {
                            title: this.env._t('Orders Summary Report'),
                            current_session_report: true,
                            from_date: from_date,
                            to_date: to_date,
                            report_order_summary_auto_check_order: this.env.pos.config.report_order_summary_auto_check_order,
                            report_order_summary_auto_check_category: this.env.pos.config.report_order_summary_auto_check_category,
                            report_order_summary_auto_check_payment: this.env.pos.config.report_order_summary_auto_check_payment,
                            report_order_summary_default_state: this.env.pos.config.report_order_summary_default_state,
                        }
                        let {
                            confirmed,
                            payload: result
                        } = await this.showPopup('PopUpReportsOrdersSummary', defaultProps)
                        if (confirmed) {
                            this.buildOrdersSummaryReport(result.values);
                        }
                    }
                    if (report_id == 3) {
                        let defaultProps = {
                            title: this.env._t('Payments Summary Report'),
                            current_session_report: true,
                            from_date: from_date,
                            to_date: to_date,
                            summary: 'sales_person',
                        }
                        let {
                            confirmed,
                            payload: result
                        } = await this.showPopup('PopUpReportPaymentsSummary', defaultProps)
                        if (confirmed) {
                            this.buildPaymentsSummaryReport(result.values);
                        }

                    }
                    if (report_id == 4) {
                        let params = {
                            model: 'pos.session',
                            method: 'build_sessions_report',
                            args: [[this.env.pos.pos_session.id]],
                        };
                        let values = await this.rpc(params, {shadow: true}).then(function (values) {
                            return values
                        }, function (err) {
                            return self.env.pos.query_backend_fail(err);
                        })
                        let reportData = values[this.env.pos.pos_session.id];
                        let start_at = field_utils.parse.datetime(reportData.session.start_at);
                        start_at = field_utils.format.datetime(start_at);
                        reportData['start_at'] = start_at;
                        if (reportData['stop_at']) {
                            var stop_at = field_utils.parse.datetime(reportData.session.stop_at);
                            stop_at = field_utils.format.datetime(stop_at);
                            reportData['stop_at'] = stop_at;
                        }
                        let reportHtml = qweb.render('ReportSalesSummarySession', {
                            pos: this.env.pos,
                            report: reportData,
                        });
                        let reportXml = qweb.render('ReportSalesSummarySessionXml', {
                            pos: this.env.pos,
                            report: reportData,
                        });
                        this.showScreen('ReportScreen', {
                            report_html: reportHtml,
                            report_xml: reportXml
                        });
                    }
                    if (report_id == 5) {
                        let result = await this.rpc({
                            model: 'report.point_of_sale.report_saledetails',
                            method: 'get_sale_details',
                            args: [false, false, false, [this.env.pos.pos_session.id]],
                        }, {
                            shadow: true,
                            timeout: 65000
                        }).then(function (result) {
                            return result
                        }, function (err) {
                            return self.env.pos.query_backend_fail(err);
                        });
                        var env = {
                            company: this.env.pos.company,
                            pos: this.env.pos,
                            products: result.products,
                            payments: result.payments,
                            taxes: result.taxes,
                            total_paid: result.total_paid,
                            date: (new Date()).toLocaleString(),
                        };
                        let report_html = qweb.render('ReportSalesDetail', env);
                        let report_xml = qweb.render('ReportSalesDetailXml', env);
                        this.showScreen('ReportScreen', {
                            report_html: report_html,
                            report_xml: report_xml
                        });
                    }
                }
            }
        }

        async buildProductsSummaryReport(values) {
            var self = this;
            let summary = [];
            if (values['report_product_summary_auto_check_product']) {
                summary.push('product_summary')
            }
            if (values['report_product_summary_auto_check_category']) {
                summary.push('category_summary')
            }
            if (values['report_product_summary_auto_check_location']) {
                summary.push('location_summary')
            }
            if (values['report_product_summary_auto_check_payment']) {
                summary.push('payment_summary')
            }
            let val = null;
            if (values.current_session_report) {
                val = {
                    'from_date': null,
                    'to_date': null,
                    'summary': summary,
                    'session_id': this.env.pos.pos_session.id,
                };
            } else {
                if (!values.from_date || !values.to_date) {
                    return this.env.pos.alert_message({
                        title: this.env._t('Error'),
                        body: this.env._t('From or To Date is missed, required input')
                    })
                }
                val = {
                    'from_date': values.from_date,
                    'to_date': values.to_date,
                    'summary': summary
                };
            }
            let params = {
                model: 'pos.order',
                method: 'product_summary_report',
                args: [val],
            };
            let results = await this.rpc(params).then(function (result) {
                return result
            }, function (err) {
                self.env.pos.query_backend_fail(err);
                return false;
            })
            this.renderProductsSummaryReport(values, results)
        }

        renderProductsSummaryReport(values, results) {
            if (Object.keys(results['category_summary']).length == 0 && Object.keys(results['product_summary']).length == 0 &&
                Object.keys(results['location_summary']).length == 0 && Object.keys(results['payment_summary']).length == 0) {
                return this.env.pos.alert_message({
                    title: this.env._t('Warning'),
                    body: this.env._t('Data not found for report')
                })
            } else {
                var product_total_qty = 0.0;
                var category_total_qty = 0.0;
                var payment_summary_total = 0.0;
                if (results['product_summary']) {
                    _.each(results['product_summary'], function (value, key) {
                        product_total_qty += value.quantity;
                    });
                }
                if (results['category_summary']) {
                    _.each(results['category_summary'], function (value, key) {
                        category_total_qty += value;
                    });
                }
                if (results['payment_summary']) {
                    _.each(results['payment_summary'], function (value, key) {
                        payment_summary_total += value;
                    });
                }
                var product_summary;
                var category_summary;
                var payment_summary;
                var location_summary;
                if (Object.keys(results['product_summary']).length) {
                    product_summary = true;
                }
                if (Object.keys(results['category_summary']).length) {
                    category_summary = true;
                }
                if (Object.keys(results['payment_summary']).length) {
                    payment_summary = true;
                }
                if (Object.keys(results['location_summary']).length) {
                    location_summary = true;
                }
                var values = {
                    pos: this.env.pos,
                    from_date: values.from_date,
                    to_date: values.to_date,
                    product_total_qty: product_total_qty,
                    category_total_qty: category_total_qty,
                    payment_summary_total: payment_summary_total,
                    product_summary: product_summary,
                    category_summary: category_summary,
                    payment_summary: payment_summary,
                    location_summary: location_summary,
                    summary: results,
                };
                let report_html = qweb.render('ReportProductsSummary', values);
                let report_xml = qweb.render('ReportProductsSummaryXml', values);
                this.showScreen('ReportScreen', {
                    report_html: report_html,
                    report_xml: report_xml
                });
            }
        }

        async buildOrdersSummaryReport(values) {
            var self = this;
            let summary = [];
            if (values['report_order_summary_auto_check_order']) {
                summary.push('order_summary_report')
            }
            if (values['report_order_summary_auto_check_category']) {
                summary.push('category_summary_report')
            }
            if (values['report_order_summary_auto_check_payment']) {
                summary.push('payment_summary_report')
            }
            let val = null;
            if (values.current_session_report) {
                val = {
                    'from_date': null,
                    'to_date': null,
                    'summary': summary,
                    'session_id': this.env.pos.pos_session.id,
                    'state': values['report_order_summary_default_state']
                };
            } else {
                if (!values.from_date || !values.to_date) {
                    return this.env.pos.alert_message({
                        title: this.env._t('Error'),
                        body: this.env._t('From or To Date is missed, required input')
                    })
                }
                val = {
                    'from_date': values.from_date,
                    'to_date': values.to_date,
                    'state': values['report_order_summary_default_state'],
                    'summary': summary
                };
            }
            let params = {
                model: 'pos.order',
                method: 'order_summary_report',
                args: [val],
            };
            let results = await this.rpc(params).then(function (result) {
                return result
            }, function (err) {
                self.env.pos.query_backend_fail(err);
                return false;
            })
            this.renderOrdersSummaryReport(values, results)
        }

        renderOrdersSummaryReport(values, results) {
            var state = results['state'];
            if (results) {
                if (Object.keys(results['category_report']).length == 0 && Object.keys(results['order_report']).length == 0 &&
                    Object.keys(results['payment_report']).length == 0) {
                    return this.env.pos.alert_message({
                        title: this.env._t('Warning'),
                        body: this.env._t('Data not found for report')
                    })
                } else {
                    var category_report;
                    var order_report;
                    var payment_report;
                    if (Object.keys(results.order_report).length == 0) {
                        order_report = false;
                    } else {
                        order_report = results['order_report']
                    }
                    if (Object.keys(results.category_report).length == 0) {
                        category_report = false;
                    } else {
                        category_report = results['category_report']
                    }
                    if (Object.keys(results.payment_report).length == 0) {
                        payment_report = false;
                    } else {
                        payment_report = results['payment_report']
                    }
                    var values = {
                        pos: this.env.pos,
                        state: state,
                        from_date: values.from_date,
                        to_date: values.to_date,
                        order_report: order_report,
                        category_report: category_report,
                        payment_report: payment_report,
                    };
                    let report_html = qweb.render('ReportOrdersSummary', values);
                    let report_xml = qweb.render('ReportOrdersSummaryXml', values)
                    this.showScreen('ReportScreen', {
                        report_html: report_html,
                        report_xml: report_xml
                    });
                }
            }


        }

        async buildPaymentsSummaryReport(values) {
            var self = this;
            let summary = values.summary;
            let val = null;
            if (values.current_session_report) {
                val = {
                    'summary': summary,
                    'session_id': this.env.pos.pos_session.id,
                };
            } else {
                if (!values.from_date || !values.to_date) {
                    return this.env.pos.alert_message({
                        title: this.env._t('Error'),
                        body: this.env._t('From or To Date is missed, required input')
                    })
                }
                val = {
                    'from_date': values.from_date,
                    'to_date': values.to_date,
                    'summary': summary
                };
            }
            let params = {
                model: 'pos.order',
                method: 'payment_summary_report',
                args: [val],
            };
            let results = await this.rpc(params).then(function (result) {
                return result
            }, function (err) {
                self.env.pos.query_backend_fail(err);
                return false;
            })
            this.renderPaymentsSummaryReport(values, results)
        }

        renderPaymentsSummaryReport(values, results) {
            if (Object.keys(results['journal_details']).length == 0 && Object.keys(results['salesmen_details']).length == 0) {
                return this.env.pos.alert_message({
                    title: this.env._t('Warning'),
                    body: this.env._t('Data not found for report')
                })
            } else {
                var journal_key = Object.keys(results['journal_details']);
                if (journal_key.length > 0) {
                    var journal_details = results['journal_details'];
                } else {
                    var journal_details = false;
                }
                var sales_key = Object.keys(results['salesmen_details']);
                if (sales_key.length > 0) {
                    var salesmen_details = results['salesmen_details'];
                } else {
                    var salesmen_details = false;
                }
                var total = Object.keys(results['summary_data']);
                if (total.length > 0) {
                    var summary_data = results['summary_data'];
                } else {
                    var summary_data = false;
                }
                const reportDatas = {
                    from_date: values.from_date,
                    to_date: values.to_date,
                    pos: this.env.pos,
                    journal_details: journal_details,
                    salesmen_details: salesmen_details,
                    summary_data: summary_data,
                    payment_detail: results['payment_detail'],
                    payment_datas: results['payment_datas']
                }
                const report_html = qweb.render('ReportPaymentsSummary', reportDatas)
                const report_xml = qweb.render('ReportPaymentsSummaryXml', reportDatas)
                this.showScreen('ReportScreen', {
                    report_html: report_html,
                    report_xml: report_xml
                })
            }
        }
    }

    Report.template = 'Report';

    Registries.Component.add(Report);

    return Report;
});
