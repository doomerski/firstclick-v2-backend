(() => {
  const select = document.querySelector('.admin-page-select');
  if (!select) return;

  const current = window.location.pathname.split('/').pop();
  if (current) {
    Array.from(select.options).forEach(option => {
      if (option.value === current) {
        option.selected = true;
      }
    });
  }

  const lastContractorId = localStorage.getItem('admin_last_contractor_id');
  const contractorOption = Array.from(select.options).find(
    option => option.value === 'admin-contractor-profile.html'
  );
  if (contractorOption && lastContractorId) {
    contractorOption.value = `admin-contractor-profile.html?id=${encodeURIComponent(lastContractorId)}`;
  }

  select.addEventListener('change', () => {
    if (select.value) {
      window.location.href = select.value;
    }
  });
})();
