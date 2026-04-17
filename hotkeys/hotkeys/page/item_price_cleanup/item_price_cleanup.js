frappe.pages['item_price_cleanup'].on_page_load = function(wrapper) {
	var page = frappe.ui.make_app_page({
		parent: wrapper,
		title: 'تنظيف أسعار الأصناف المكررة',
		single_column: true
	});

	$(page.body).html(`
		<div style="padding: 15px;">

			<div id="summary-cards" style="display:none; margin-bottom:20px;">
				<div class="row">
					<div class="col-sm-3">
						<div style="background:#fff4e5; border:1px solid #ffc107; border-radius:6px; padding:16px; text-align:center;">
							<div style="font-size:28px; font-weight:600; color:#e65100;" id="card-groups">0</div>
							<div style="font-size:12px; color:#888; margin-top:4px;">مجموعات مكررة</div>
						</div>
					</div>
					<div class="col-sm-3">
						<div style="background:#fdecea; border:1px solid #f44336; border-radius:6px; padding:16px; text-align:center;">
							<div style="font-size:28px; font-weight:600; color:#b71c1c;" id="card-duplicates">0</div>
							<div style="font-size:12px; color:#888; margin-top:4px;">أسعار للحذف</div>
						</div>
					</div>
					<div class="col-sm-3">
						<div style="background:#e8f5e9; border:1px solid #4caf50; border-radius:6px; padding:16px; text-align:center;">
							<div style="font-size:28px; font-weight:600; color:#1b5e20;" id="card-kept">0</div>
							<div style="font-size:12px; color:#888; margin-top:4px;">أسعار تُحفظ (الأحدث)</div>
						</div>
					</div>
					<div class="col-sm-3">
						<div style="background:#e3f2fd; border:1px solid #2196f3; border-radius:6px; padding:16px; text-align:center;">
							<div style="font-size:28px; font-weight:600; color:#0d47a1;" id="card-deleted">0</div>
							<div style="font-size:12px; color:#888; margin-top:4px;">تم حذفه</div>
						</div>
					</div>
				</div>
			</div>

			<div id="results-area" style="display:none;">
				<div style="margin-bottom:12px; display:flex; align-items:center; gap:10px; flex-wrap:wrap;">
					<input type="text" id="search-box" class="form-control"
						placeholder="بحث بالصنف أو قائمة الأسعار..." style="max-width:300px;" />
					<button class="btn btn-default btn-sm" id="btn-select-all">
						<i class="fa fa-check-square-o"></i> تحديد الكل
					</button>
					<button class="btn btn-default btn-sm" id="btn-deselect-all">
						<i class="fa fa-square-o"></i> إلغاء تحديد الكل
					</button>
				</div>

				<table class="table table-bordered table-hover" id="duplicates-table"
					style="font-size:13px; direction:rtl;">
					<thead style="background:#f5f5f5;">
						<tr>
							<th style="width:30px;"></th>
							<th>الصنف</th>
							<th>قائمة الأسعار</th>
							<th>النوع</th>
							<th>السعر (للحذف)</th>
							<th>العملة</th>
							<th>تاريخ التعديل</th>
							<th>الحالة</th>
						</tr>
					</thead>
					<tbody id="table-body"></tbody>
				</table>

				<div style="margin-top:16px; display:flex; gap:10px; align-items:center;">
					<button class="btn btn-danger" id="btn-delete-selected" disabled>
						<i class="fa fa-trash"></i> حذف المحدد
					</button>
					<button class="btn btn-default" id="btn-refresh">
						<i class="fa fa-refresh"></i> إعادة الفحص
					</button>
					<span id="selection-count" style="font-size:13px; color:#666;"></span>
				</div>
			</div>

			<div id="empty-state" style="display:none; text-align:center; padding:60px 20px;">
				<i class="fa fa-check-circle" style="font-size:48px; color:#4caf50;"></i>
				<p style="margin-top:12px; font-size:16px; color:#555;">لا توجد أسعار مكررة — كل شيء نظيف!</p>
			</div>

			<div id="initial-state" style="text-align:center; padding:60px 20px;">
				<i class="fa fa-search" style="font-size:48px; color:#aaa;"></i>
				<p style="margin-top:12px; font-size:16px; color:#888;">اضغط "فحص التكرارات" للبدء</p>
			</div>

		</div>
	`);

	page.add_inner_button('فحص التكرارات', function() {
		loadDuplicates();
	}, null, 'primary');

	window._deletedNames = new Set();
};

function loadDuplicates() {
	frappe.dom.freeze('جاري الفحص...');
	frappe.call({
		method: 'hotkeys.hotkeys.page.item_price_cleanup.item_price_cleanup.get_duplicate_prices',
		callback: function(r) {
			frappe.dom.unfreeze();
			if (r.exc) { frappe.msgprint('حدث خطأ أثناء الفحص'); return; }
			var data = r.message;

			$('#initial-state').hide();

			if (!data.groups || data.groups.length === 0) {
				$('#summary-cards').hide();
				$('#results-area').hide();
				$('#empty-state').show();
				return;
			}

			$('#card-groups').text(data.total_groups);
			$('#card-duplicates').text(data.total_duplicates);
			$('#card-kept').text(data.total_groups);
			$('#card-deleted').text(window._deletedNames.size);
			$('#summary-cards').show();
			$('#empty-state').hide();
			renderTable(data.groups);
			$('#results-area').show();
		}
	});
}

function renderTable(groups) {
	var tbody = $('#table-body');
	tbody.empty();
	var rows = [];

	groups.forEach(function(group) {
		group.duplicates.forEach(function(dup) {
			if (window._deletedNames.has(dup.name)) return;
			var typeLabel = group.selling ? 'بيع' : (group.buying ? 'شراء' : '—');
			var typeClass = group.selling ? 'label-success' : 'label-warning';
			rows.push({
				name: dup.name,
				item_code: group.item_code,
				item_name: group.item_name,
				price_list: group.price_list,
				type_label: typeLabel,
				type_class: typeClass,
				rate: dup.price_list_rate,
				currency: dup.currency || '',
				modified: dup.modified ? dup.modified.split('.')[0] : '',
				keeper_rate: group.keeper.price_list_rate
			});
		});
	});

	if (rows.length === 0) {
		$('#results-area').hide();
		$('#empty-state').show();
		return;
	}

	// Sort by item_code alphabetically
	rows.sort(function(a, b) {
		return a.item_code.localeCompare(b.item_code, 'ar');
	});

	rows.forEach(function(row) {
		tbody.append(
			'<tr data-name="' + row.name + '" data-item="' + row.item_code + '" data-pricelist="' + row.price_list + '">' +
			'<td><input type="checkbox" class="row-check" data-name="' + row.name + '"/></td>' +
			'<td><strong>' + row.item_code + '</strong><br/><small class="text-muted">' + row.item_name + '</small></td>' +
			'<td>' + row.price_list + '</td>' +
			'<td><span class="label ' + row.type_class + '">' + row.type_label + '</span></td>' +
			'<td style="color:#c62828;"><del>' + (row.rate || 0).toFixed(2) + '</del>' +
				'<br/><small style="color:#2e7d32;">← الأحدث: ' + (row.keeper_rate || 0).toFixed(2) + '</small></td>' +
			'<td>' + row.currency + '</td>' +
			'<td style="font-size:11px;">' + row.modified + '</td>' +
			'<td><span class="label label-danger">للحذف</span></td>' +
			'</tr>'
		);
	});

	bindTableEvents();
	updateSelectionCount();
}

function bindTableEvents() {
	$('#btn-select-all').off('click').on('click', function() {
		$('.row-check:visible').prop('checked', true);
		updateSelectionCount();
	});

	$('#btn-deselect-all').off('click').on('click', function() {
		$('.row-check').prop('checked', false);
		updateSelectionCount();
	});

	$(document).off('change', '.row-check').on('change', '.row-check', function() {
		updateSelectionCount();
	});

	$('#search-box').off('input').on('input', function() {
		var q = $(this).val().toLowerCase();
		$('#duplicates-table tbody tr').each(function() {
			var item = ($(this).data('item') || '').toLowerCase();
			var pl = ($(this).data('pricelist') || '').toLowerCase();
			$(this).toggle(item.includes(q) || pl.includes(q));
		});
		updateSelectionCount();
	});

	$('#btn-delete-selected').off('click').on('click', function() {
		var selected = [];
		$('.row-check:checked').each(function() {
			selected.push($(this).data('name'));
		});
		if (!selected.length) return;
		frappe.confirm(
			'هل تريد حذف <strong>' + selected.length + '</strong> سعر مكرر؟<br/>سيُحفظ السعر الأحدث لكل صنف.',
			function() { deleteSelected(selected); }
		);
	});

	$('#btn-refresh').off('click').on('click', function() { loadDuplicates(); });
}

function deleteSelected(names) {
	frappe.dom.freeze('جاري الحذف...');
	frappe.call({
		method: 'hotkeys.hotkeys.page.item_price_cleanup.item_price_cleanup.delete_duplicate_prices',
		args: { names_to_delete: names },
		callback: function(r) {
			frappe.dom.unfreeze();
			if (r.exc) { frappe.msgprint('حدث خطأ أثناء الحذف'); return; }
			var res = r.message;
			names.forEach(function(n) { window._deletedNames.add(n); });
			$('#card-deleted').text(window._deletedNames.size);

			var msg = 'تم حذف <strong>' + res.deleted + '</strong> سعر.';
			if (res.errors && res.errors.length) {
				msg += '<br/><small class="text-warning">تجاوز: ' + res.errors.join('<br/>') + '</small>';
			}
			frappe.msgprint({ message: msg, indicator: res.deleted > 0 ? 'green' : 'orange' });
			loadDuplicates();
		}
	});
}

function updateSelectionCount() {
	var n = $('.row-check:checked').length;
	var total = $('.row-check:visible').length;
	$('#selection-count').text(n + ' محدد من ' + total);
	$('#btn-delete-selected').prop('disabled', n === 0);
}
