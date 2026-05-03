export const pageStyles = `
  @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@700;900&family=DM+Sans:wght@300;400;500;600&display=swap');

  * { box-sizing: border-box; margin: 0; padding: 0; }

  .page { padding: 32px 40px; font-family: 'DM Sans', sans-serif; background: #F5F5F0; min-height: 100vh; }

  .page-header { display: flex; align-items: flex-start; justify-content: space-between; margin-bottom: 32px; }
  .page-title { font-family: 'Playfair Display', serif; font-size: 32px; font-weight: 700; color: #1A1A1A; letter-spacing: -1px; }
  .page-sub { font-size: 14px; color: #888; margin-top: 4px; font-weight: 300; }

  .btn-add { background: #1A3A2A; color: white; padding: 12px 24px; border-radius: 100px; font-size: 14px; font-weight: 600; border: none; cursor: pointer; font-family: 'DM Sans', sans-serif; transition: all 0.2s; display: flex; align-items: center; gap: 8px; white-space: nowrap; }
  .btn-add:hover { background: #0F2419; transform: translateY(-1px); box-shadow: 0 6px 20px rgba(26,58,42,0.25); }

  .card { background: white; border-radius: 16px; border: 1px solid #E8E8E0; overflow: hidden; }

  .table-wrap { overflow-x: auto; -webkit-overflow-scrolling: touch; }
  table { width: 100%; border-collapse: collapse; }
  thead tr { border-bottom: 1px solid #F0F0E8; }
  th { padding: 14px 20px; text-align: left; font-size: 11px; font-weight: 700; letter-spacing: 2px; text-transform: uppercase; color: #AAA; }
  tbody tr { border-bottom: 1px solid #F7F7F4; transition: background 0.15s; }
  tbody tr:last-child { border-bottom: none; }
  tbody tr:hover { background: #FAFAF7; }
  td { padding: 16px 20px; font-size: 14px; color: #444; vertical-align: middle; }

  .badge { display: inline-flex; align-items: center; gap: 5px; padding: 4px 12px; border-radius: 100px; font-size: 12px; font-weight: 600; }
  .badge-verified  { background: #EDFAF2; color: #16A34A; }
  .badge-pending   { background: #FEF9EC; color: #B45309; }
  .badge-rejected  { background: #FEF2F2; color: #DC2626; }
  .badge-flagged   { background: #FFF7ED; color: #EA580C; }
  .badge-active    { background: #EFF6FF; color: #2563EB; }
  .badge-fulfilled { background: #EDFAF2; color: #16A34A; }
  .badge-defaulted { background: #FEF2F2; color: #DC2626; }
  .badge-cancelled { background: #F3F4F6; color: #6B7280; }
  .badge-admin     { background: #F0F7F3; color: #1A3A2A; }
  .badge-member    { background: #F3F4F6; color: #374151; }
  .badge-owner     { background: #FDF8F0; color: #C8891A; }
  .badge-treasurer { background: #EFF6FF; color: #2563EB; }
  .badge-secretary { background: #FFF0F6; color: #BE185D; }
  .badge-open      { background: #EDFAF2; color: #16A34A; }
  .badge-closed    { background: #F3F4F6; color: #6B7280; }

  .avatar { width: 36px; height: 36px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 14px; font-weight: 700; color: white; flex-shrink: 0; }

  .empty-state { padding: 64px 32px; text-align: center; }
  .empty-icon  { font-size: 40px; margin-bottom: 16px; }
  .empty-title { font-size: 17px; font-weight: 600; color: #1A1A1A; margin-bottom: 8px; }
  .empty-sub   { font-size: 14px; color: #888; font-weight: 300; }

  /* ── Modal ── */
  .modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.4); backdrop-filter: blur(4px); z-index: 200; display: flex; align-items: center; justify-content: center; padding: 24px; }
  .modal { background: white; border-radius: 20px; width: 100%; max-width: 520px; max-height: 90vh; overflow-y: auto; box-shadow: 0 32px 80px rgba(0,0,0,0.2); }
  .modal-header { padding: 28px 32px 0; display: flex; align-items: center; justify-content: space-between; }
  .modal-title { font-family: 'Playfair Display', serif; font-size: 24px; font-weight: 700; color: #1A1A1A; }
  .modal-close { width: 32px; height: 32px; border-radius: 50%; border: none; background: #F3F4F6; cursor: pointer; font-size: 16px; display: flex; align-items: center; justify-content: center; transition: background 0.2s; }
  .modal-close:hover { background: #E5E7EB; }
  .modal-body { padding: 24px 32px 32px; }

  /* ── Forms ── */
  .form-group { margin-bottom: 18px; }
  .form-label { font-size: 13px; font-weight: 600; color: #333; margin-bottom: 7px; display: block; }
  .form-input { width: 100%; padding: 12px 14px; border: 1.5px solid #E8E8E0; border-radius: 10px; font-size: 14px; font-family: 'DM Sans', sans-serif; color: #1A1A1A; background: white; transition: all 0.2s; outline: none; }
  .form-input:focus { border-color: #1A3A2A; box-shadow: 0 0 0 3px rgba(26,58,42,0.08); }
  .form-input::placeholder { color: #BBB; }
  select.form-input { cursor: pointer; }
  textarea.form-input { resize: vertical; min-height: 90px; }
  .form-row { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }

  .modal-actions { display: flex; gap: 12px; justify-content: flex-end; margin-top: 24px; }
  .btn-cancel { background: #F3F4F6; color: #374151; padding: 11px 24px; border-radius: 100px; font-size: 14px; font-weight: 600; border: none; cursor: pointer; font-family: 'DM Sans', sans-serif; transition: background 0.2s; }
  .btn-cancel:hover { background: #E5E7EB; }
  .btn-submit { background: #1A3A2A; color: white; padding: 11px 28px; border-radius: 100px; font-size: 14px; font-weight: 600; border: none; cursor: pointer; font-family: 'DM Sans', sans-serif; transition: all 0.2s; }
  .btn-submit:hover { background: #0F2419; }
  .btn-submit:disabled { opacity: 0.6; cursor: not-allowed; }

  .error-box { background: #FEF2F2; border: 1px solid #FECACA; border-radius: 8px; padding: 10px 14px; margin-bottom: 16px; font-size: 13px; color: #DC2626; }

  /* ── Stats ── */
  .stat-row   { display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; margin-bottom: 24px; }
  .stat-card  { background: white; border: 1px solid #E8E8E0; border-radius: 14px; padding: 20px 24px; }
  .stat-label { font-size: 11px; font-weight: 700; letter-spacing: 2px; text-transform: uppercase; color: #AAA; margin-bottom: 8px; }
  .stat-value { font-family: 'Playfair Display', serif; font-size: 28px; font-weight: 700; color: #1A1A1A; }
  .stat-sub   { font-size: 12px; color: #888; margin-top: 3px; }

  /* ── Search ── */
  .search-bar   { display: flex; align-items: center; gap: 12px; margin-bottom: 20px; }
  .search-input { flex: 1; padding: 10px 16px; border: 1.5px solid #E8E8E0; border-radius: 100px; font-size: 14px; font-family: 'DM Sans', sans-serif; outline: none; transition: border-color 0.2s; }
  .search-input:focus { border-color: #1A3A2A; }

  /* ── Loading ── */
  .loading { display: flex; align-items: center; justify-content: center; padding: 64px; }
  .spinner { width: 32px; height: 32px; border: 3px solid #E8E8E0; border-top-color: #1A3A2A; border-radius: 50%; animation: spin 0.8s linear infinite; }
  @keyframes spin { to { transform: rotate(360deg); } }

  .mpesa-ref { font-family: monospace; background: #F5F5F0; padding: 3px 8px; border-radius: 6px; font-size: 12px; color: #555; letter-spacing: 1px; }

  .action-btn { background: none; border: 1px solid #E8E8E0; padding: 5px 12px; border-radius: 100px; font-size: 12px; font-weight: 600; cursor: pointer; font-family: 'DM Sans', sans-serif; transition: all 0.2s; color: #444; }
  .action-btn:hover { border-color: #1A3A2A; color: #1A3A2A; }
  .action-btn.danger:hover { border-color: #DC2626; color: #DC2626; }

  /* ── Contributions responsive grid ── */
  .contrib-grid-header {
    display: grid;
    grid-template-columns: 2fr 1fr 1.2fr 1fr 1fr auto;
    padding: 12px 20px;
    background: #FAFAF7;
    border-bottom: 1px solid #E8E8E0;
    font-size: 11px; font-weight: 700;
    text-transform: uppercase; letter-spacing: 1px; color: #AAA;
  }
  .contrib-grid-row {
    display: grid;
    grid-template-columns: 2fr 1fr 1.2fr 1fr 1fr auto;
    padding: 14px 20px;
    align-items: center;
    background: white;
    transition: background 0.1s;
  }
  .contrib-grid-row:hover { background: #FAFAF7; }

  /* ── Members responsive grid ── */
  .member-grid-header {
    display: grid;
    grid-template-columns: 2fr 1fr 1fr 1fr auto;
    padding: 12px 20px;
    background: #FAFAF7;
    border-bottom: 1px solid #E8E8E0;
    font-size: 11px; font-weight: 700;
    text-transform: uppercase; letter-spacing: 1px; color: #AAA;
  }
  .member-grid-row {
    display: grid;
    grid-template-columns: 2fr 1fr 1fr 1fr auto;
    padding: 16px 20px;
    align-items: center;
    background: white;
    transition: background 0.1s;
  }
  .member-grid-row:hover { background: #FAFAF7; }

  /* ── Section label (Meetings) ── */
  .section-label { padding: 8px 20px; font-size: 11px; font-weight: 700; letter-spacing: 2px; text-transform: uppercase; color: #AAA; background: #FAFAF7; border-bottom: 1px solid #F0F0E8; }

  /* ── Meeting card ── */
  .meeting-card { display: flex; gap: 14px; padding: 16px 20px; border-bottom: 1px solid #F3F4F6; align-items: flex-start; }
  .meeting-card:last-child { border-bottom: none; }
  .date-block { width: 44px; flex-shrink: 0; background: #F0F7F3; border: 1px solid #C8DFD2; border-radius: 10px; text-align: center; padding: 6px 4px; }
  .date-block.upcoming { background: #1A3A2A; border-color: #1A3A2A; }
  .date-block.upcoming .month,
  .date-block.upcoming .day { color: white; }
  .month { font-size: 9px; font-weight: 700; color: #1A3A2A; text-transform: uppercase; letter-spacing: 1px; }
  .day   { font-family: 'Playfair Display', serif; font-size: 20px; font-weight: 700; color: #1A3A2A; line-height: 1; }
  .meeting-info { flex: 1; }
  .meeting-header { display: flex; align-items: center; gap: 8px; margin-bottom: 4px; }
  .meeting-header .title { font-size: 14px; font-weight: 600; color: #1A1A1A; }
  .meta  { font-size: 12px; color: #AAA; display: flex; gap: 12px; }
  .notes { font-size: 13px; color: #666; margin-top: 6px; background: #FAFAF7; border-radius: 8px; padding: 8px 10px; border-left: 3px solid #C8891A; }
  .meeting-list { display: flex; flex-direction: column; }

  /* ── Responsive ── */
  @media (max-width: 768px) {
    .page { padding: 16px; }
    .page-title { font-size: 24px; }
    .page-sub { font-size: 13px; }
    .btn-add { padding: 10px 16px; font-size: 13px; }

    .stat-row  { grid-template-columns: repeat(2, 1fr); gap: 10px; }
    .stat-card { padding: 14px 16px; }
    .stat-value { font-size: 22px; }
    .stat-label { font-size: 10px; }

    .form-row { grid-template-columns: 1fr; }

    .modal { border-radius: 16px; }
    .modal-header { padding: 20px 20px 0; }
    .modal-body { padding: 16px 20px 24px; }

    /* Contributions → cards */
    .contrib-grid-header { display: none; }
    .contrib-grid-row {
      display: flex;
      flex-direction: column;
      gap: 10px;
      padding: 16px;
      align-items: flex-start;
    }

    /* Members → cards */
    .member-grid-header { display: none; }
    .member-grid-row {
      display: flex;
      flex-direction: column;
      gap: 10px;
      padding: 16px;
      align-items: flex-start;
    }
  }

  @media (max-width: 480px) {
    .stat-row { grid-template-columns: 1fr 1fr; }
    .stat-value { font-size: 20px; }
    .empty-state { padding: 40px 16px; }
  }
`;