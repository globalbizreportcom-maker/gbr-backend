import express from "express";
import Database from "better-sqlite3";

const router = express.Router();
const db = new Database("./db/companies.db");
db.pragma("journal_mode = WAL");

// Search API
router.get("/search", (req, res) => {
  const q = req.query.q;
  if (!q) return res.status(400).json({ error: "Missing query param 'q'" });

  const stmt = db.prepare(`
    SELECT CompanyName, CIN, CompanyStateCode, Registered_Office_Address
    FROM companies_fts
    WHERE companies_fts MATCH ?
    LIMIT 20
  `);

  const results = stmt.all(q);
  res.json(results);
});

/**
 * Search companies with FTS + state filter + pagination
 */
export function getCompanies({
  company = "",
  country = "",
  state = "",
  page = 1,
  perPage = 20,
  dbPath = "./sqldb/companies.db",
} = {}) {
  const db = new Database(dbPath, { readonly: true });
  const offset = (page - 1) * perPage;

  const normalizedCountry = country.trim().toLowerCase();
  const normalizedState = state.trim().toUpperCase();

  const hasCompany = company.trim().length > 0;
  const hasState = normalizedCountry === "india" && normalizedState.length > 0;

  const params = {};

  // ------------------- FTS filter -------------------
  let ftsWhere = "";
  if (hasCompany) {
    const ftsKeyword = company.trim().split(/\s+/).join(" NEAR ");
    params.keyword = ftsKeyword;
    ftsWhere = `fts.CompanyName MATCH @keyword`;
  }

  // ------------------- State filter -------------------
  let stateWhere = "";
  if (hasState) {
    stateWhere = `LOWER(REPLACE(TRIM(c.CompanyStateCode), ' ', '')) = @state`;
    params.state = normalizedState.toLowerCase();
  }

  // ------------------- Combine filters -------------------
  let whereClause = "";
  if (ftsWhere && stateWhere) whereClause = `${ftsWhere} AND ${stateWhere}`;
  else if (ftsWhere) whereClause = ftsWhere;
  else if (stateWhere) whereClause = stateWhere;

  // ------------------- Count total rows -------------------
  let totalRows = 0;
  if (whereClause) {
    totalRows = db.prepare(`
      SELECT COUNT(*) AS total
      FROM companies c
      JOIN companies_fts fts ON c.rowid = fts.rowid
      WHERE ${whereClause}
    `).get(params).total;
  } else {
    totalRows = db.prepare(`SELECT COUNT(*) AS total FROM companies`).get().total;
  }

  // ------------------- Fetch rows -------------------
  let rows = [];
  if (whereClause) {
    rows = db.prepare(`
      SELECT c.*
      FROM companies c
      JOIN companies_fts fts ON c.rowid = fts.rowid
      WHERE ${whereClause}
      LIMIT @perPage OFFSET @offset
    `).all({ ...params, perPage, offset });
  } else {
    rows = db.prepare(`
      SELECT *
      FROM companies
      LIMIT @perPage OFFSET @offset
    `).all({ perPage, offset });
  }

  const totalPages = Math.ceil(totalRows / perPage);
  db.close();

  return { totalRows, totalPages, page, perPage, rows };
}




export default router;
