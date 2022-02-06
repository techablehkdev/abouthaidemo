var PosIDB = (function (exports) {
    'use strict';

    const {get, set, del, keys, clear, Store} = idbKeyval;
    // Here we use custom store in using idbKeyVal. This is to avoid
    // overlap with other service workers that uses the library.
    // This is an added future-proofing to prevent name conflicts
    // when other modules started to introduce service worker with
    // the use of idbkeyval library as well.
    let db = ""
    if (odoo && odoo.info && odoo.info.db) {
        db = odoo.info.db
    }
    if (odoo && odoo.session_info && odoo.session_info.db) {
        db = odoo.session_info.db
    }
    const store = new Store(db + '_master_DB', 'POS-Database');

    const PosIDB = {
        get(key) {
            return get(key, store);
        },
        set(key, value) {
            return set(key, value, store);
        },
        del(key) {
            return del(key, store);
        },
        keys() {
            return keys(store);
        },
        clear() {
            return clear(store);
        },
    };

    Object.assign(exports, PosIDB);

    return exports;
})({});