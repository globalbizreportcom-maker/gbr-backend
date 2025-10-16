import fs from "fs";
import path from "path";
import Database from "better-sqlite3";

/**
 * Load all JSON files in a directory into a single SQLite DB with FTS
 */
export const loadAllJsonsToSQLite = (dataDir = "./data", dbPath = "./sqldb/companies.db") => {
  try {
    if (!fs.existsSync(dataDir)) {
      console.warn(`Data directory not found: ${dataDir}`);
      return;
    }

    const files = fs.readdirSync(dataDir).filter(f => f.endsWith(".json"));
    console.log(`Found ${files.length} JSON files in ${dataDir}`);

    const db = new Database(dbPath);
    db.pragma("journal_mode = WAL");

    // ------------------ Main table ------------------
    db.prepare(`
      CREATE TABLE IF NOT EXISTS companies (
        CIN TEXT,
        CompanyName TEXT,
        CompanyROCcode TEXT,
        CompanyCategory TEXT,
        CompanySubCategory TEXT,
        CompanyClass TEXT,
        AuthorizedCapital TEXT,
        PaidupCapital TEXT,
        CompanyRegistrationdate_date TEXT,
        Registered_Office_Address TEXT,
        Listingstatus TEXT,
        CompanyStatus TEXT,
        CompanyStateCode TEXT,
        "CompanyIndian/Foreign Company" TEXT,
        nic_code TEXT,
        CompanyIndustrialClassification TEXT
      )
    `).run();

    // ------------------ Prepare insert ------------------
    const insert = db.prepare(`
      INSERT OR IGNORE INTO companies (
        CIN, CompanyName, CompanyROCcode, CompanyCategory, CompanySubCategory,
        CompanyClass, AuthorizedCapital, PaidupCapital, CompanyRegistrationdate_date,
        Registered_Office_Address, Listingstatus, CompanyStatus, CompanyStateCode,
        "CompanyIndian/Foreign Company", nic_code, CompanyIndustrialClassification
      )
      VALUES (
        @CIN, @CompanyName, @CompanyROCcode, @CompanyCategory, @CompanySubCategory,
        @CompanyClass, @AuthorizedCapital, @PaidupCapital, @CompanyRegistrationdate_date,
        @Registered_Office_Address, @Listingstatus, @CompanyStatus, @CompanyStateCode,
        @CompanyIndianForeignCompany, @nic_code, @CompanyIndustrialClassification
      )
    `);

    const transaction = db.transaction((data) => {
      for (const row of data) {
        insert.run({
          CIN: row.CIN || null,
          CompanyName: row.CompanyName || null,
          CompanyROCcode: row.CompanyROCcode || null,
          CompanyCategory: row.CompanyCategory || null,
          CompanySubCategory: row.CompanySubCategory || null,
          CompanyClass: row.CompanyClass || null,
          AuthorizedCapital: row.AuthorizedCapital || null,
          PaidupCapital: row.PaidupCapital || null,
          CompanyRegistrationdate_date: row.CompanyRegistrationdate_date || null,
          Registered_Office_Address: row.Registered_Office_Address || null,
          Listingstatus: row.Listingstatus || null,
          CompanyStatus: row.CompanyStatus || null,
          CompanyStateCode: row.CompanyStateCode || null,
          CompanyIndianForeignCompany: row["CompanyIndian/Foreign Company"] || null,
          nic_code: row.nic_code || null,
          CompanyIndustrialClassification: row.CompanyIndustrialClassification || null
        });
      }
    });

    // ------------------ Load JSON files ------------------
    let totalCount = 0;
    for (const file of files) {
      const filePath = path.join(dataDir, file);
      console.log(`\n➡️ Processing: ${file}`);
      const data = JSON.parse(fs.readFileSync(filePath, "utf8"));
      console.log(`📄 Loaded ${data.length} records from JSON`);
      transaction(data);
      totalCount += data.length;
      console.log(`✅ Inserted ${data.length} records into DB`);
    }

    // ------------------ Create FTS table ------------------
    db.prepare(`
      CREATE VIRTUAL TABLE IF NOT EXISTS companies_fts USING fts5(
        CompanyName,
        Registered_Office_Address,
        CompanyStateCode,
        CompanyIndustrialClassification,
        content='companies'
      )
    `).run();

    db.prepare(`
      INSERT INTO companies_fts (rowid, CompanyName, Registered_Office_Address, CompanyStateCode, CompanyIndustrialClassification)
      SELECT rowid, CompanyName, Registered_Office_Address, CompanyStateCode, CompanyIndustrialClassification
      FROM companies
      WHERE rowid > (SELECT IFNULL(MAX(rowid), 0) FROM companies_fts)
    `).run();

    console.log(`\n⚡ FTS index created`);
    console.log(`\n✅ Total records inserted from all JSON files: ${totalCount}`);

    db.close();
  } catch (err) {
    console.error("❌ Error:", err);
  }
};
