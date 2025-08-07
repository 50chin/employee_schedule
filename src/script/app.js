let scheduleChart = null;
let fullData = [];

function initFilters() {
  const now = new Date();
  const weekAgo = new Date(now);
  weekAgo.setDate(now.getDate() - 7);

  document.getElementById("startDate").valueAsDate = weekAgo;
  document.getElementById("endDate").valueAsDate = now;
}

document.addEventListener("DOMContentLoaded", () => {
  initFilters();
  getData();
});

document.getElementById("applyFilter").addEventListener("click", applyFilters);

async function getData() {
  try {
    const [plan, fact] = await Promise.all([
      fetch("../src/data/plan.json").then((res) => {
        if (!res.ok) throw new Error("Не удалось загрузить plan.json");
        return res.json();
      }),
      fetch("../src/data/fact.json").then((res) => {
        if (!res.ok) throw new Error("Не удалось загрузить fact.json");
        return res.json();
      }),
    ]);

    fullData = mergeData(plan, fact);
    applyFilters();
  } catch (err) {
    console.error("Ошибка загрузки данных:", err);
    alert("Ошибка загрузки данных: " + err.message);
  }
}

function mergeData(plan, fact) {
  const groupedFacts = groupFacts(fact);

  const merged = [];

  plan.forEach((planItem) => {
    const date = new Date(planItem.ДатаВремя_ПланС).toDateString();
    const key = `${planItem.Сотрудник}|${planItem.Магазин}|${date}`;
    const planStart = new Date(planItem.ДатаВремя_ПланС);
    const planEnd = new Date(planItem.ДатаВремя_ПланПо);

    let matchedFact = null;

    if (groupedFacts[key]) {
      matchedFact = groupedFacts[key].find((factItem) => {
        const factStart = new Date(factItem.ДатаВремя_ФактС);
        const factEnd = new Date(factItem.ДатаВремя_ФактПо);

        return factEnd > planStart && factStart < planEnd;
      });

      if (matchedFact) {
        groupedFacts[key] = groupedFacts[key].filter((f) => f !== matchedFact);
      }
    }

    merged.push({
      employee: planItem.Сотрудник,
      store: planItem.Магазин,
      role: planItem.Роль,
      planStart,
      planEnd,
      factStart: matchedFact?.ДатаВремя_ФактС
        ? new Date(matchedFact.ДатаВремя_ФактС)
        : null,
      factEnd: matchedFact?.ДатаВремя_ФактПо
        ? new Date(matchedFact.ДатаВремя_ФактПо)
        : null,
    });
  });

  return merged;
}

function applyFilters() {
  const startDate = document.getElementById("startDate").value;
  const endDate = document.getElementById("endDate").value;

  const filteredShifts = filterShiftsByMax4ConsecutiveDays(
    fullData,
    startDate,
    endDate,
    4
  );
  const allGrouped = groupAllShifts(filteredShifts);

  renderChart(allGrouped);
}

function filterShifts(data, startDate, endDate, maxDays = 4) {
  const filtered = [];

  const employeeDays = {};
  const start = new Date(startDate);
  const end = new Date(endDate);

  data.forEach((item) => {
    if (item.planStart < start || item.planStart > end) return;

    const key = `${item.employee} (${item.store})`;
    const day = item.planStart.toDateString();

    if (!employeeDays[key]) {
      employeeDays[key] = new Set();
    }

    employeeDays[key].add(day);

    if (employeeDays[key].size <= maxDays) {
      filtered.push(item);
    }
  });

  return filtered;
}

function groupShifts(data) {
  return data.reduce((acc, item) => {
    const key = `${item.employee} (${item.store})`;
    if (!acc[key]) {
      acc[key] = {
        label: key,
        role: item.role,
        shifts: [],
      };
    }
    acc[key].shifts.push(item);
    return acc;
  }, {});
}

function groupFacts(facts) {
  const grouped = {};

  facts.forEach((fact) => {
    const date = new Date(fact.ДатаВремя_ФактС || 0).toDateString();
    const key = `${fact.Сотрудник}|${fact.Магазин}|${date}`;

    if (!grouped[key]) grouped[key] = [];

    grouped[key].push(fact);
  });

  return grouped;
}

function groupAllShifts(data) {
  return data.reduce((acc, item) => {
    const key = `${item.employee} (${item.store})`;
    if (!acc[key]) {
      acc[key] = {
        label: key,
        role: item.role,
        shifts: [],
      };
    }
    acc[key].shifts.push(item);
    return acc;
  }, {});
}

function filterShiftsByMax4ConsecutiveDays(
  data,
  startDate,
  endDate,
  maxDays = 4
) {
  const start = new Date(startDate);
  const end = new Date(endDate);

  const grouped = data.reduce((acc, shift) => {
    const shiftDate = new Date(shift.planStart);
    if (shiftDate < start || shiftDate > end) return acc;

    const key = `${shift.employee} (${shift.store})`;
    if (!acc[key]) acc[key] = [];
    acc[key].push(shift);
    return acc;
  }, {});

  const result = [];

  Object.values(grouped).forEach((shifts) => {
    const uniqueDates = Array.from(
      new Set(shifts.map((s) => s.planStart.toDateString()))
    )
      .map((d) => new Date(d))
      .sort((a, b) => a - b);

    let sequences = [];
    let currentSeq = [uniqueDates[0]];

    for (let i = 1; i < uniqueDates.length; i++) {
      const diffDays =
        (uniqueDates[i] - uniqueDates[i - 1]) / (1000 * 60 * 60 * 24);
      if (diffDays === 1) {
        currentSeq.push(uniqueDates[i]);
      } else {
        sequences.push(currentSeq);
        currentSeq = [uniqueDates[i]];
      }
    }
    sequences.push(currentSeq);

    const allowedDates = sequences.flatMap((seq) => seq.slice(0, maxDays));
    const allowedDateStrings = new Set(
      allowedDates.map((d) => d.toDateString())
    );

    shifts.forEach((shift) => {
      const shiftDateStr = shift.planStart.toDateString();
      if (allowedDateStrings.has(shiftDateStr)) {
        result.push(shift);
      }
    });
  });

  return result;
}

function renderChart(groupedData) {
  const ctx = document.getElementById("scheduleChart").getContext("2d");

  if (scheduleChart) {
    scheduleChart.destroy();
  }

  const startDate = new Date(document.getElementById("startDate").value);
  const endDate = new Date(document.getElementById("endDate").value);
  const groups = Object.values(groupedData);
  const yLabels = groups.map((g) => g.label);

  const labelIndexMap = {};
  yLabels.forEach((label, index) => {
    labelIndexMap[label] = index;
  });

  const planData = [];
  const factData = [];

  const ySpacing = 0.12;

  groups.forEach((group) => {
    const yBase = labelIndexMap[group.label];

    group.shifts.forEach((shift) => {
      // План
      planData.push({
        x: new Date(shift.planStart),
        y: yBase + ySpacing,
        duration: (shift.planEnd - shift.planStart) / (1000 * 60 * 60),
        type: "План",
      });

      // Факт
      if (shift.factStart && shift.factEnd) {
        factData.push({
          x: new Date(shift.factStart),
          y: yBase - ySpacing,
          duration: (shift.factEnd - shift.factStart) / (1000 * 60 * 60),
          type: "Факт",
        });
      }
    });
  });

  scheduleChart = new Chart(ctx, {
    type: "scatter",
    data: {
      datasets: [
        {
          label: "План",
          data: planData,
          parsing: false,
          pointStyle: "rect",
          pointRadius: 10,
          pointHoverRadius: 12,
          backgroundColor: "rgba(54, 162, 235, 0.9)",
          borderColor: "rgba(54, 162, 235, 1)",
          borderWidth: 1,
          showLine: false,
        },
        {
          label: "Факт",
          data: factData,
          parsing: false,
          pointStyle: "rect",
          pointRadius: 10,
          pointHoverRadius: 12,
          backgroundColor: "rgba(255, 99, 132, 1)",
          borderColor: "rgba(255, 99, 132, 1)",
          borderWidth: 1,
          showLine: false,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      layout: {
        padding: 10,
      },
      scales: {
        x: {
          type: "time",
          time: {
            unit: "day",
            tooltipFormat: "dd.MM.yyyy",
            displayFormats: {
              day: "dd.MM",
            },
          },
          min: startDate,
          max: endDate,
          title: {
            display: true,
            text: "Дата",
          },
        },
        y: {
          type: "linear",
          min: -1,
          max: yLabels.length,
          ticks: {
            stepSize: 1,
            callback: function (value) {
              return yLabels[value] ?? "";
            },
            font: {
              size: 12,
            },
          },
          title: {
            display: true,
            text: "Сотрудник",
          },
        },
      },
      plugins: {
        tooltip: {
          callbacks: {
            label: function (context) {
              const point = context.raw;
              const start = new Date(point.x);
              const end = new Date(
                point.type === "План"
                  ? start.getTime() + point.duration * 60 * 60 * 1000
                  : start.getTime() -
                    2 * 60 * 60 * 1000 +
                    point.duration * 60 * 60 * 1000
              );

              const startStr =
                start.toLocaleDateString() +
                " " +
                start.toLocaleTimeString([], {
                  hour: "2-digit",
                  minute: "2-digit",
                });
              const endStr = end.toLocaleTimeString([], {
                hour: "2-digit",
                minute: "2-digit",
              });

              return `${point.type}: ${startStr} - ${endStr}`;
            },
          },
        },

        legend: {
          display: true,
          position: "top",
        },
      },
      onClick: (e, elements) => {
        if (elements.length > 0) {
          const el = elements[0];
          const dataset = scheduleChart.data.datasets[el.datasetIndex];
          const data = dataset.data[el.index];

          if (dataset.label === "План") {
            const start = new Date(data.x.getTime());
            const end = new Date(
              start.getTime() + data.duration * 60 * 60 * 1000
            );
            alert(
              `План: ${start.toLocaleTimeString([], {
                hour: "2-digit",
                minute: "2-digit",
              })} — ${end.toLocaleTimeString([], {
                hour: "2-digit",
                minute: "2-digit",
              })}`
            );
          }
        }
      },
    },
  });
}
