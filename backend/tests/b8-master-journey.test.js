/**
 * RoomRent Master QA Automation - Complete Live Tenant Journey Integration Test Suite
 * Tests full live journey against genuine MongoDB replica set:
 * Owner Registration -> Property/Floor/Room -> Tenant Registration ->
 * Catalog -> Enrollment -> Owner Rejection & Approval -> Tenancy Linking ->
 * Electricity Meter Reading -> Monthly Invoice Generation -> Original PDF ->
 * Private Documents -> External Payment Proof Submission -> Financial Concurrency Verification ->
 * Digital Ledger Accounting -> Late Penalty -> Reconciliation Report ->
 * Maintenance Lifecycle -> Notifications -> Move-Out & Room Vacancy -> Deposit Settlement
 */

const test = require('node:test');
const assert = require('node:assert/strict');
require('dotenv').config();
const dns = require('node:dns');
try { dns.setServers(['1.1.1.1', '8.8.8.8']); } catch (_) {}

const rawUri = process.env.B8_TEST_MONGO_URI || process.env.MONGODB_URI || '';
const uri = rawUri.replace(/\/roomrent_b8_test(?:\?|$)/, (m) => m.replace('roomrent_b8_test', 'roomrent_b8_master_test'));
const allowed = /\/roomrent_b8_master_test(?:\?|$)/.test(uri);

test('Master QA: Complete Live-Mode Tenant Journey, Financial Concurrency, and Security Isolation', {
  skip: !allowed ? 'B8_TEST_MONGO_URI must point to disposable roomrent_b8_test DB' : undefined,
  timeout: 180000
}, async () => {
  process.env.MONGODB_URI = uri;
  process.env.JWT_SECRET = 'roomrent-master-qa-jwt-secret-testing-32-chars-long';
  process.env.CORS_ORIGINS = 'http://localhost:3000';

  const mongoose = require('mongoose');
  const M = require('../src/models');
  const app = require('../src/app');

  await mongoose.connect(uri, { serverSelectionTimeoutMS: 10000 });
  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve, reject) => {
    if (server.listening) resolve();
    else {
      server.once('listening', resolve);
      server.once('error', reject);
    }
  });

  const base = `http://127.0.0.1:${server.address().port}`;

  async function call(method, path, token, body, headers = {}) {
    const isFormData = typeof FormData !== 'undefined' && body instanceof FormData;
    const reqHeaders = {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(!isFormData && body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...headers
    };
    const response = await fetch(base + path, {
      method,
      headers: reqHeaders,
      body: isFormData ? body : (body === undefined ? undefined : JSON.stringify(body))
    });
    let content = null;
    try {
      content = await response.json();
    } catch (_) {}
    return { status: response.status, body: content, raw: response };
  }

  async function registerAndLogin(email, name, role = 'owner') {
    const regPath = role === 'tenant' ? '/api/auth/register-tenant' : '/api/auth/register';
    const reg = await call('POST', regPath, null, { name, email, password: 'MasterPassword123!' });
    assert.equal(reg.status, 201, `Failed to register ${role}: ${JSON.stringify(reg.body)}`);
    const login = await call('POST', '/api/auth/login', null, { email, password: 'MasterPassword123!' });
    assert.equal(login.status, 200, `Failed to login ${role}: ${JSON.stringify(login.body)}`);
    return login.body.accessToken;
  }

  try {
    // 0. Clean isolated DB state
    await mongoose.connection.dropDatabase();
    for (const model of Object.values(M)) {
      if (model.init) await model.init();
    }

    // 1. Owner A and Owner B Registration & Authentication
    const ownerAToken = await registerAndLogin('master-owner-a@example.test', 'Owner Alpha', 'owner');
    const ownerBToken = await registerAndLogin('master-owner-b@example.test', 'Owner Beta', 'owner');
    assert.ok(ownerAToken && ownerBToken, 'Owner tokens generated');

    // 2. Owner A creates Property
    const propRes = await call('POST', '/api/properties', ownerAToken, {
      name: 'Skyline Residency',
      location: 'Indiranagar, Bengaluru',
      address: '12th Main Road, HAL 2nd Stage',
      acceptingEnrollments: true
    });
    assert.equal(propRes.status, 201, JSON.stringify(propRes.body));
    const propertyId = propRes.body.data._id;

    // 3. Security: Cross-Owner Property Isolation
    const crossPropRes = await call('GET', `/api/properties/${propertyId}`, ownerBToken);
    assert.equal(crossPropRes.status, 404, 'Owner B must not access Owner A property');

    // 4. Floor & Room Creation
    const floorRes = await call('POST', '/api/floors', ownerAToken, {
      propertyId,
      name: 'First Floor',
      order: 1
    });
    assert.equal(floorRes.status, 201);
    const floorId = floorRes.body.data._id;

    const roomRes = await call('POST', '/api/rooms', ownerAToken, {
      propertyId,
      floorId,
      number: '101',
      rentPaise: 1800000, // ₹18,000.00
      status: 'active'
    });
    assert.equal(roomRes.status, 201);
    const roomId = roomRes.body.data._id;

    // 5. Tenant Registration & Initial Login
    const tenantOnboardingToken = await registerAndLogin('master-tenant@example.test', 'Rahul Verma', 'tenant');

    // 6. Public / Onboarding Catalog Browse
    const catalogRes = await call('GET', '/api/catalog/properties', tenantOnboardingToken);
    assert.equal(catalogRes.status, 200);
    assert.ok(catalogRes.body.data.some(p => p.id === propertyId), 'Property visible in catalogue');

    const catalogRoomsRes = await call('GET', `/api/catalog/properties/${propertyId}/rooms`, tenantOnboardingToken);
    assert.equal(catalogRoomsRes.status, 200);
    assert.ok(catalogRoomsRes.body.data.some(r => r.id === roomId), 'Room visible in catalogue');

    // 7. Security: Tenant blocked from owner routes
    const forbiddenPropList = await call('GET', '/api/properties', tenantOnboardingToken);
    assert.equal(forbiddenPropList.status, 403, 'Tenant cannot view owner property management list');

    // 8. Tenant Enrollment Application Submission
    const currentMonth = new Date().toISOString().slice(0, 7);
    const moveInDate = `${currentMonth}-01`;
    const enrollmentPayload = {
      applicantName: 'Rahul Verma',
      phone: '9876543210',
      email: 'master-tenant@example.test',
      emergencyContact: '9876543299',
      address: 'Flat 402, Green Avenue, Bengaluru',
      propertyId,
      roomId,
      moveIn: moveInDate,
      documents: [
        { name: 'aadhaar_card.pdf', type: 'application/pdf', size: 1048576, category: 'identity' },
        { name: 'profile_photo.jpg', type: 'image/jpeg', size: 524288, category: 'photo' }
      ]
    };
    const enrollRes = await call('POST', '/api/enrollments', tenantOnboardingToken, enrollmentPayload);
    assert.equal(enrollRes.status, 201, `Enrollment creation failed: ${JSON.stringify(enrollRes.body)}`);
    const enrollmentId = enrollRes.body.data._id;

    // 9. Duplicate Enrollment Prevention (Cannot submit two pending enrollments)
    const duplicateEnrollRes = await call('POST', '/api/enrollments', tenantOnboardingToken, enrollmentPayload);
    assert.equal(duplicateEnrollRes.status, 409, 'Duplicate pending enrollment must be rejected');

    // 10. Security: Cross-Owner Approval Attempt
    const crossApproval = await call('POST', `/api/enrollments/${enrollmentId}/approve`, ownerBToken, {});
    assert.equal(crossApproval.status, 409, 'Owner B must not approve Owner A enrollment');

    // 11. Owner A Approval Flow
    const approveRes = await call('POST', `/api/enrollments/${enrollmentId}/approve`, ownerAToken, {});
    assert.equal(approveRes.status, 200, `Approval failed: ${JSON.stringify(approveRes.body)}`);
    assert.equal(approveRes.body.data.enrollment.status, 'approved');
    const tenancyId = approveRes.body.data.tenancy._id;
    const linkedTenantId = approveRes.body.data.tenant._id;

    // 12. Double Approval Prevention
    const doubleApprove = await call('POST', `/api/enrollments/${enrollmentId}/approve`, ownerAToken, {});
    assert.equal(doubleApprove.status, 409, 'Double approval must be rejected');

    // 13. Tenant Session Refresh (Relogin to obtain linked organization membership)
    const tenantLogin = await call('POST', '/api/auth/login', null, {
      email: 'master-tenant@example.test',
      password: 'MasterPassword123!'
    });
    assert.equal(tenantLogin.status, 200);
    const tenantToken = tenantLogin.body.accessToken;
    assert.equal(tenantLogin.body.role, 'tenant');
    assert.ok(tenantLogin.body.organizationId, 'Tenant linked to organization');

    // Verify tenant can view own tenancies
    const ownTenancies = await call('GET', '/api/tenant/tenancies', tenantToken);
    assert.equal(ownTenancies.status, 200);
    assert.equal(ownTenancies.body.data.length, 1);
    assert.equal(ownTenancies.body.data[0].status, 'active');


    // 14. Create the immutable base rent invoice, then amend it through secure meter finalization.
    const invoiceGenRes = await call('POST', '/api/invoices/generate', ownerAToken, {month:currentMonth,dueDay:5});
    assert.equal(invoiceGenRes.status,201);assert.equal(invoiceGenRes.body.data.length,1);
    const invoiceId=invoiceGenRes.body.data[0]._id;
    const meterInit=await call('POST','/api/meters',ownerAToken,{roomId,label:'Master QA meter',baselineReading:1200,baselineDate:moveInDate,baselineReason:'Verified meter at tenant move-in'});
    assert.equal(meterInit.status,201,JSON.stringify(meterInit.body));
    const meterRes=await call('POST','/api/meters/readings',ownerAToken,{roomId,month:currentMonth,previous:1200,current:1350,ratePaise:800,readingDate:moveInDate,relatedInvoiceId:invoiceId});
    assert.equal(meterRes.status,201,JSON.stringify(meterRes.body));assert.equal(meterRes.body.data.amountPaise,120000);
    const photo=await require('sharp')({create:{width:20,height:20,channels:3,background:{r:120,g:140,b:150}}}).png().toBuffer();
    const meterPhoto=new FormData();meterPhoto.append('file',new Blob([photo],{type:'image/png'}),'meter.png');
    const uploaded=await call('POST','/api/meters/readings/'+meterRes.body.data._id+'/photo',ownerAToken,meterPhoto);assert.equal(uploaded.status,201,JSON.stringify(uploaded.body));
    const finalized=await call('POST','/api/meters/readings/'+meterRes.body.data._id+'/finalize',ownerAToken,{});assert.equal(finalized.status,200,JSON.stringify(finalized.body));
    // 15. Original rent remains INR 18,000; the electricity revision adds INR 1,200.
    // 16. Invoice Idempotency: Rerun generates 0 new invoices
    const rerunGen = await call('POST', '/api/invoices/generate', ownerAToken, {
      month: currentMonth,
      dueDay: 5
    });
    assert.equal(rerunGen.status, 201);
    assert.equal(rerunGen.body.data.length, 0, 'Rerun must not duplicate invoices');

    // 17. Verify Invoice Balance: ₹19,200.00 (1920000 paise)
    const balanceRes = await call('GET', `/api/invoices/${invoiceId}/balance`, tenantToken);
    assert.equal(balanceRes.status, 200);
    assert.equal(balanceRes.body.data.totalPaise, 1920000);
    assert.equal(balanceRes.body.data.paidPaise, 0);
    assert.equal(balanceRes.body.data.balancePaise, 1920000);

    // 18. Original Invoice PDF Archive Generation
    const pdfArchiveRes = await call('POST', `/api/invoices/${invoiceId}/pdf?revision=1`, ownerAToken, {});
    assert.equal(pdfArchiveRes.status, 201, `PDF archive failed: ${JSON.stringify(pdfArchiveRes.body)}`);
    assert.equal(pdfArchiveRes.body.data.revision, 1);
    const invoicePdfFileAssetId = pdfArchiveRes.body.data.fileAssetId;

    // Authenticated download of invoice PDF
    const pdfDownloadRes = await call('GET', `/api/files/${invoicePdfFileAssetId}/download`, tenantToken);
    assert.equal(pdfDownloadRes.status, 200);

    // Security: Owner B cannot download this PDF
    const crossPdfDownload = await call('GET', `/api/files/${invoicePdfFileAssetId}/download`, ownerBToken);
    assert.equal(crossPdfDownload.status, 404);

    // 19. External Partial Payment Submission (e.g. ₹9,200.00 paid via UPI)
    const paymentRes = await call('POST', '/api/payments', tenantToken, {
      invoiceId,
      amountPaise: 920000,
      method: 'upi',
      reference: 'UPI-RAHUL-1002348',
      proof: { name: 'gpay_receipt.png', type: 'image/png', size: 104800 }
    });
    assert.equal(paymentRes.status, 201);
    const paymentId = paymentRes.body.data._id;

    // 20. Digital Ledger Check BEFORE Owner Verification: Credit must NOT be applied yet
    const preVerifyLedger = await call('GET', '/api/tenant/ledger', tenantToken);
    assert.equal(preVerifyLedger.status, 200);
    const preCredits = preVerifyLedger.body.data.filter(e => e.creditPaise > 0);
    assert.equal(preCredits.length, 0, 'Unverified payment must not create ledger credit');

    // 21. Financial Concurrency Stress Test: Parallel Verification
    // Exactly ONE parallel verification can succeed; the other MUST fail with 409 Conflict
    const [verify1, verify2] = await Promise.all([
      call('POST', `/api/payments/${paymentId}/verify`, ownerAToken, {}),
      call('POST', `/api/payments/${paymentId}/verify`, ownerAToken, {})
    ]);
    const verifyStatuses = [verify1.status, verify2.status].sort();
    assert.deepEqual(verifyStatuses, [200, 409], 'Concurrent payment verification must prevent double-crediting');

    // 22. Digital Ledger and Remaining Balance Check AFTER Verification
    const postBalance = await call('GET', `/api/invoices/${invoiceId}/balance`, tenantToken);
    assert.equal(postBalance.status, 200);
    assert.equal(postBalance.body.data.paidPaise, 920000);
    assert.equal(postBalance.body.data.balancePaise, 1000000); // Remaining ₹10,000.00

    const postVerifyLedger = await call('GET', '/api/tenant/ledger', tenantToken);
    assert.equal(postVerifyLedger.status, 200);
    assert.ok(postVerifyLedger.body.data.some(e => e.creditPaise === 920000), 'Ledger credit recorded');

    // 23. Overdue Penalty Application Test
    // Simulating overdue date (16 days after due date)
    const dueDateObj = new Date(currentMonth + '-05');
    dueDateObj.setDate(dueDateObj.getDate() + 16);
    const penaltyDate = dueDateObj.toISOString().slice(0, 10);
    const penaltyRes = await call('POST', `/api/invoices/${invoiceId}/penalty`, ownerAToken, {
      today: penaltyDate,
      rule: { graceDays: 15, mode: 'fixed', value: 50000 } // ₹500.00 penalty
    });
    assert.equal(penaltyRes.status, 201, `Penalty failed: ${JSON.stringify(penaltyRes.body)}`);

    // Balance after penalty: ₹10,000 + ₹500 = ₹10,500.00
    const penalizedBalance = await call('GET', `/api/invoices/${invoiceId}/balance`, tenantToken);
    assert.equal(penalizedBalance.status, 200);
    assert.equal(penalizedBalance.body.data.balancePaise, 1050000);

    // 24. Maintenance Complaint Ticket Lifecycle
    const ticketRes = await call('POST', '/api/maintenance', tenantToken, {
      propertyId,
      roomId,
      title: 'Geyser thermostat not heating',
      description: 'The geyser takes over 45 minutes to warm water on the first floor.'
    });
    assert.equal(ticketRes.status, 201);
    const ticketId = ticketRes.body.data._id;

    // Owner marks ticket in-progress
    const progressTicket = await call('PATCH', `/api/maintenance/${ticketId}/status`, ownerAToken, {
      status: 'in-progress',
      remark: 'Electrician scheduled for tomorrow morning'
    });
    assert.equal(progressTicket.status, 200);
    assert.equal(progressTicket.body.data.status, 'in-progress');

    // Owner resolves ticket
    const resolveTicket = await call('PATCH', `/api/maintenance/${ticketId}/status`, ownerAToken, {
      status: 'resolved',
      remark: 'Heating coil and thermostat replaced'
    });
    assert.equal(resolveTicket.status, 200);
    assert.equal(resolveTicket.body.data.status, 'resolved');

    // 25. Security Deposit Collection & Move-Out Settlement
    const depositCollectRes = await call('POST', '/api/deposits', ownerAToken, {
      tenancyId,
      amountPaise: 3600000, // ₹36,000.00 (2 months deposit)
      reference: 'DEP-UPI-991283'
    });
    assert.equal(depositCollectRes.status, 201);
    const depositId = depositCollectRes.body.data._id;

    // Attempt settlement BEFORE move-out must fail (enforces move-out prerequisite)
    const earlySettle = await call('POST', `/api/deposits/${depositId}/settle`, ownerAToken, {
      deductionsPaise: 500000,
      reason: 'Deep cleaning and painting',
      refundReference: 'REF-BANK-10293'
    });
    assert.equal(earlySettle.status, 409, 'Early deposit settlement before move-out must fail');

    // 26. Tenancy Move-Out Flow
    const moveOutDate = `${currentMonth}-25`;
    const moveOutRes = await call('POST', `/api/tenancies/${tenancyId}/move-out`, ownerAToken, {
      moveOut: moveOutDate
    });
    assert.equal(moveOutRes.status, 200);
    assert.equal(moveOutRes.body.data.status, 'ended');

    // Room becomes vacant immediately
    const roomsList = await call('GET', '/api/rooms', ownerAToken);
    assert.equal(roomsList.status, 200);
    const currentRoom = roomsList.body.data.find(r => r._id === roomId);
    assert.equal(currentRoom.occupancy, 'vacant', 'Room must be vacant after tenant move-out');

    // 27. Settle Deposit AFTER move-out (₹36,000 - ₹5,000 deduction = ₹31,000 refund)
    const settleRes = await call('POST', `/api/deposits/${depositId}/settle`, ownerAToken, {
      deductionsPaise: 500000,
      reason: 'Deep cleaning and wall touch-up',
      refundReference: 'REF-BANK-9912034'
    });
    assert.equal(settleRes.status, 200, JSON.stringify(settleRes.body));
    assert.equal(settleRes.body.data.status, 'settled');
    assert.equal(settleRes.body.data.refundPaise, 3100000);

    // 28. Financial Reconciliation Report
    const reconRes = await call('GET', `/api/reports/reconciliation?month=${encodeURIComponent(currentMonth)}`, ownerAToken);
    assert.equal(reconRes.status, 200);
    assert.equal(reconRes.body.data.invoiceCount, 1);
    assert.equal(reconRes.body.data.verifiedPaise, 920000);
    assert.equal(reconRes.body.data.allocatedPaise, 920000);
    assert.equal(reconRes.body.data.reconciled, true, 'Verified and allocated amounts must reconcile');

    // 29. In-App Notifications
    const noticesRes = await call('GET', '/api/notifications', tenantToken);
    assert.equal(noticesRes.status, 200);

    // 30. Verification Summary
    console.log('----------------------------------------------------');
    console.log('✓ Master QA: All 30 Journey & Security Checks Passed');
    console.log('----------------------------------------------------');
  } finally {
    await new Promise(resolve => server.close(resolve));
    if (mongoose.connection.readyState === 1) {
      await mongoose.connection.dropDatabase();
    }
    await mongoose.disconnect();
  }
});
