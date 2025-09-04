// Script for Oslo Cargo Flight Tracker
// This JavaScript file fetches flight and airline data from Avinor's
// public XML feeds (via a CORS proxy), filters the results down to
// cargo operators, and renders a clean table. Times are converted
// from UTC to the Europe/Oslo timezone.
(function () {
  "use strict";

  const CARGO_CODES = [
    "UPS", "5X", "BCS", "ES", "QY", "D0",
    "APF", "HP", "QAF", "Q7", "QR"
  ];
  const CARGO_KEYWORDS = [
    "cargo", "dhl", "ups", "amapola",
    "qatar", "freight", "postal"
  ];

  const BASE_URL = "https://corsproxy.io/?https://asrv.avinor.no";
  const XML_FEED_URL = `${BASE_URL}/XmlFeed/v1.0`;
  const AIRLINE_NAMES_URL = `${BASE_URL}/airlineNames/v1.0`;

  const refreshButton = document.getElementById("refreshBtn");
  const tableBody = document.querySelector("#flightsTable tbody");

  function parseAirlineNames(xmlString) {
    const parser = new DOMParser();
    const doc = parser.parseFromString(xmlString, "application/xml");
    const airlineElems = doc.getElementsByTagName("airlineName");
    const map = {};
    for (let i = 0; i < airlineElems.length; i++) {
      const code = airlineElems[i].getAttribute("code");
      const name = airlineElems[i].getAttribute("name");
      if (code && name) {
        map[code.toUpperCase()] = name;
      }
    }
    return map;
  }

  function parseFlights(xmlString) {
    const parser = new DOMParser();
    const doc = parser.parseFromString(xmlString, "application/xml");
    const flightElems = doc.getElementsByTagName("flight");
    const flights = [];
    for (let i = 0; i < flightElems.length; i++) {
      const f = flightElems[i];
      const getText = (tag) => {
        const el = f.getElementsByTagName(tag)[0];
        return el ? el.textContent.trim() : "";
      };
      const airline = getText("airline").toUpperCase();
      const flightId = getText("flight_id");
      const scheduleTime = getText("schedule_time");
      const arrDep = getText("arr_dep");
      const otherAirport = getText("airport");
      const statusEl = f.getElementsByTagName("status")[0];
      const statusCode = statusEl ? statusEl.getAttribute("code") : null;
      const statusTime = statusEl ? statusEl.getAttribute("time") : null;
      flights.push({
        airline,
        flightId,
        scheduleTime,
        arrDep,
        otherAirport,
        statusCode,
        statusTime,
      });
    }
    return flights;
  }

  function formatLocalTime(isoTime) {
    if (!isoTime) return "";
    const date = new Date(isoTime);
    const formatter = new Intl.DateTimeFormat("en-GB", {
      timeZone: "Europe/Oslo",
      day: "2-digit",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
    const parts = formatter.formatToParts(date);
    const day = parts.find((p) => p.type === "day").value;
    const month = parts.find((p) => p.type === "month").value;
    const hour = parts.find((p) => p.type === "hour").value;
    const minute = parts.find((p) => p.type === "minute").value;
    return `${day} ${month} ${hour}:${minute}`;
  }

  function getStatusDescription(code, time) {
    if (!code) return "";
    const statusMap = {
      A: "Arrived",
      C: "Cancelled",
      D: "Departed",
      E: "New time",
      N: "New info",
    };
    let desc = statusMap[code] || code;
    if (code === "E" && time) {
      desc = `New time ${formatLocalTime(time)}`;
    }
    return desc;
  }

  function isCargoFlight(flight, airlinesMap) {
    const code = flight.airline;
    if (CARGO_CODES.includes(code)) {
      return true;
    }
    const name = (airlinesMap[code] || "").toLowerCase();
    return CARGO_KEYWORDS.some((kw) => name.includes(kw));
    }

  function renderFlights(flights, airlinesMap) {
    tableBody.innerHTML = "";
    if (flights.length === 0) {
      const row = document.createElement("tr");
      const cell = document.createElement("td");
      cell.colSpan = 6;
      cell.textContent = "No cargo flights found in the selected timeframe.";
      row.appendChild(cell);
      tableBody.appendChild(row);
      return;
    }
    flights.forEach((flight) => {
      const row = document.createElement("tr");
      const timeCell = document.createElement("td");
      timeCell.textContent = formatLocalTime(flight.scheduleTime);
      row.appendChild(timeCell);

      const airlineCell = document.createElement("td");
      airlineCell.textContent = airlinesMap[flight.airline] || flight.airline;
      row.appendChild(airlineCell);

      const flightCell = document.createElement("td");
      flightCell.textContent = flight.flightId;
      row.appendChild(flightCell);

      const directionCell = document.createElement("td");
      directionCell.textContent = flight.arrDep === "A" ? "Arrival" : "Departure";
      row.appendChild(directionCell);

      const airportCell = document.createElement("td");
      airportCell.textContent = flight.otherAirport;
      row.appendChild(airportCell);

      const statusCell = document.createElement("td");
      statusCell.textContent = getStatusDescription(flight.statusCode, flight.statusTime);
      row.appendChild(statusCell);

      tableBody.appendChild(row);
    });
  }

  async function loadFlights() {
    tableBody.innerHTML = "";
    const loadingRow = document.createElement("tr");
    const loadingCell = document.createElement("td");
    loadingCell.colSpan = 6;
    loadingCell.textContent = "Loading flights…";
    loadingRow.appendChild(loadingCell);
    tableBody.appendChild(loadingRow);

    try {
      const params = new URLSearchParams({
        airport: "OSL",
        TimeFrom: "1",
        TimeTo: "24",
      });
      const flightResPromise = fetch(`${XML_FEED_URL}?${params.toString()}`);
      const airlinesResPromise = fetch(AIRLINE_NAMES_URL);
      const [flightRes, airlinesRes] = await Promise.all([flightResPromise, airlinesResPromise]);
      const flightsXml = await flightRes.text();
      const airlinesXml = await airlinesRes.text();
      const airlinesMap = parseAirlineNames(airlinesXml);
      const allFlights = parseFlights(flightsXml);
      const cargoFlights = allFlights.filter((flight) => isCargoFlight(flight, airlinesMap));
      cargoFlights.sort((a, b) => new Date(a.scheduleTime) - new Date(b.scheduleTime));
      renderFlights(cargoFlights, airlinesMap);
    } catch (err) {
      tableBody.innerHTML = "";
      const row = document.createElement("tr");
      const cell = document.createElement("td");
      cell.colSpan = 6;
      cell.textContent = `Error fetching flight data: ${err.message}`;
      row.appendChild(cell);
      tableBody.appendChild(row);
      console.error(err);
    }
  }

  refreshButton.addEventListener("click", loadFlights);
  window.addEventListener("load", loadFlights);
})();