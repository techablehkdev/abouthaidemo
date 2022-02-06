function remove_pos_database() {
    localStorage.clear();
    let database_template = this.odoo.info.db;
    for (var i = 0; i <= 100; i++) {
        indexedDB.deleteDatabase(database_template + '_' + i);
        console.log('removed db: ' + database_template + '_' + i);
    }
    indexedDB.deleteDatabase('POS-DB');
}