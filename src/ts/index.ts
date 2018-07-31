import AugurFeeWindow from './augurFeeWindows';
import BigNumber from 'bignumber.js';

function pad(x: number, size: number): string {
  let sign = Math.sign(x) === -1 ? '-' : '';
  return sign + padString(Math.abs(x).toString(), size);
}

function padString(x: string, size: number): string {
  return new Array(size).concat([x]).join('0').slice(-size);
}

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function tM<T>(func: (() => Promise<T>), n: number = 5): Promise<T> {
  try {
    return await func();
  }
  catch (err) {
    if (n == 1) {
      throw new Error(`tM: ${err}`);
    } else {
      await sleep(1000);
      console.log("Retry...");
      return tM(func, n - 1);
    }
  }
}

function getValueFrom(id: string): BigNumber {
  return new BigNumber((<HTMLInputElement>document.getElementById(id)).value);
}

function setValueFrom(id: string, value: string): void {
  (<HTMLInputElement>document.getElementById(id)).value = value;
}

function recalculate() {
  const repPrice = getValueFrom("rep-eth-price");
  const gasPrice = getValueFrom("gas-price"); //Attention this is Gwei and not in ETH!
  const gasUsed = getValueFrom("gas-used");
  const rep = getValueFrom("num-rep");
  const fees = getValueFrom("fees-input");
  const stake = getValueFrom("stake-input");
  if (!repPrice.isNaN() && !gasPrice.isNaN() && !gasUsed.isNaN() && !rep.isNaN()) {
    let res = feeWindow.calculateParticipationRentability(
      fees,
      gasPrice.shiftedBy(-9), //convert Gwei to ETH
      gasUsed,
      rep,
      repPrice,
      stake
    );

    document.getElementById("gas-cost").innerText = res.gasCost.toString();
    document.getElementById("fee-profit").innerText = res.totalFeeProfit.toString();
    document.getElementById("profit").innerText = res.totalProfit.toString();
    document.getElementById("profit-per-rep2").innerText = res.profitPerRep.toString();
    document.getElementById("profit-percent").innerText = (res.profitPercent.times(100)).toString();
    document.getElementById("profit-percent-pa").innerText = (res.profitPercentPA.times(100)).toString();
    document.getElementById("break-even").innerText = res.numRepBreakEven.toString();
    document.getElementById("max-prof-rep").innerText = res.numRepMaxProfitPerRep.toString();
    document.getElementById("gas-price-break-even").innerText =
      res.gasPriceBreakEven.shiftedBy(9).toString(); //convert from ETH to Gwei
  }
}

async function retrievePreviousFeeWindow(): Promise<void> {
  let previousFeeWindow = await tM(() => feeWindow.getPreviousFeeWindow());
  document.getElementById("prev-fee-window").innerText = previousFeeWindow.address;
  document.getElementById("fee-prev").innerText = previousFeeWindow.balance.toString();
  document.getElementById("total-fee-stake-prev").innerText = previousFeeWindow.totalFeeStake.toString();
}

async function retrieveValues(): Promise<void> {
  let [repEthPrice, gasPrice, currentFeeWindow, nextFeeWindow] = await Promise.all([
    tM(() => feeWindow.getRepEthPrice()),
    tM(() => feeWindow.getGasPrice()),
    tM(() => feeWindow.getCurrentFeeWindow()),
    tM(() => feeWindow.getNextFeeWindow())
  ]);
  //fill in the values
  document.getElementById("current-fee-window").innerText = currentFeeWindow.address;
  document.getElementById("fee-current").innerText = currentFeeWindow.balance.toString();
  document.getElementById("profit-per-rep").innerText =
    currentFeeWindow.balance.dividedBy(currentFeeWindow.totalFeeStake).toString();
  document.getElementById("total-fee-stake").innerText = currentFeeWindow.totalFeeStake.toString();
  document.getElementById("current-fee-window-end").innerText = currentFeeWindow.endTime.toUTCString();
  document.getElementById("next-fee-window").innerText = nextFeeWindow.address;
  document.getElementById("fee-next").innerText = nextFeeWindow.balance.toString();

  setValueFrom("rep-eth-price", repEthPrice.toString());
  setValueFrom("gas-price", gasPrice.shiftedBy(9).toString()); //convert from ETH to Gwei
  setValueFrom("gas-used", "323848");
  setValueFrom("num-rep", "1");
  setValueFrom("fees-input", currentFeeWindow.balance.toString());
  setValueFrom("stake-input", currentFeeWindow.totalFeeStake.toString());

  document.getElementById("rep-eth-price").onchange = recalculate;
  document.getElementById("gas-price").onchange = recalculate;
  document.getElementById("gas-used").onchange = recalculate;
  document.getElementById("num-rep").onchange = recalculate;
  document.getElementById("fees-input").onchange = recalculate;
  document.getElementById("stake-input").onchange = recalculate;

  computeTimeUntilEnd(currentFeeWindow.endTime);
  recalculate();
  document.getElementById("loading").style.display = "none";
  document.getElementById("content").style.display = "block";
}

let feeWindow = new AugurFeeWindow();

retrieveValues()
  .catch(e => console.log(e));
retrievePreviousFeeWindow()
  .catch(e => console.log(e));

function computeTimeUntilEnd(date: Date) {
  let milliseconds = date.valueOf() - (new Date()).valueOf();
  let t = Math.round(milliseconds / 1000);
  let secs = t % 60;
  t = Math.floor(t / 60);
  let minutes = t % 60;
  t = Math.floor(t / 60);
  document.getElementById("current-fee-window-ends-in").innerText =
    (t > 9 ? t : pad(t, 2)) + ":" + pad(minutes, 2) + ":" + pad(secs, 2);
  let sleep = milliseconds % 1000;
  if (sleep < 100) {
    sleep = 1000;
  }
  window.setTimeout(() => computeTimeUntilEnd(date), sleep);
}