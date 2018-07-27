import Web3 from 'web3';
import BN from 'bn.js';

const universeABI = [
  {
    "constant": true,
    "inputs": [] as any[],
    "name": "getCurrentFeeWindow",
    "outputs": [{"name": "", "type": "address"}],
    "payable": false,
    "stateMutability": "view",
    "type": "function"
  },
  {
    "constant": true,
    "inputs": [],
    "name": "getNextFeeWindow",
    "outputs": [{"name": "", "type": "address"}],
    "payable": false,
    "stateMutability": "view",
    "type": "function"
  },
  {
    "constant": true,
    "inputs": [],
    "name": "getPreviousFeeWindow",
    "outputs": [{"name": "", "type": "address"}],
    "payable": false,
    "stateMutability": "view",
    "type": "function"
  }
];
const cashABI = [
  {
    "constant": true,
    "inputs": [{"name": "_owner", "type": "address"}],
    "name": "balanceOf",
    "outputs": [{"name": "", "type": "uint256"}],
    "payable": false,
    "stateMutability": "view",
    "type": "function"
  }
];
const feeWindowABI = [
  {
    "constant": true,
    "inputs": [] as any[],
    "name": "getTotalFeeStake",
    "outputs": [{"name": "", "type": "uint256"}],
    "payable": false,
    "stateMutability": "view",
    "type": "function"
  },
  {
    "constant": true,
    "inputs": [] as any[],
    "name": "getEndTime",
    "outputs": [{"name": "", "type": "uint256"}],
    "payable": false,
    "stateMutability": "view",
    "type": "function"
  }
];

const DEFAULT_CASH_CONTRACT_ADDRESS = '0xd5524179cB7AE012f5B642C1D6D700Bbaa76B96b';
const DEFAULT_UNIVERSE_CONTRACT_ADDRESS = '0xE991247b78F937D7B69cFC00f1A487A293557677';
const DEFAULT_WEB3_PROVIDER = 'https://mainnet.infura.io/augur';

export interface FeeWindow {
  address: string,
  balance: BN,        // in Wei
  totalFeeStake: BN,  // in Wei(REP)
  endTime: Date,
}

interface ParticipationRentabilityResult {
  gasCost: BN,               // in Wei
  totalFeeProfit: BN,        // in Wei
  totalProfit: BN,           // in Wei
  profitPerRep: number,      // ratio
  profitPercent: number,     // percent 1 means 100%
  profitPercentPA: number,   // percent 1 means 100%
  numRepBreakEven: BN,       // in Wei(REP)
  gasPriceBreakEven: BN,     // in Wei
  numRepMaxProfitPerRep: BN  // in Wei(REP)
}

export class AugurFeeWindow {
  private universeContract: any;
  private cashContract: any;
  private web3: Web3;

  constructor() {

    this.web3 = new Web3(Web3.givenProvider || DEFAULT_WEB3_PROVIDER);

    this.cashContract = new this.web3.eth.Contract(cashABI, DEFAULT_CASH_CONTRACT_ADDRESS);
    this.universeContract = new this.web3.eth.Contract(universeABI, DEFAULT_UNIVERSE_CONTRACT_ADDRESS);
  }

  /**
   *
   * @returns {number} - Gas price in Wei
   */
  public async getGasPrice(): Promise<BN> {
    try {
      const res = await fetch('https://ethgasstation.info/json/ethgasAPI.json');
      const resJSON = await res.json() as { safeLow: number };
      const gasPrice = this.web3.utils.toBN(resJSON.safeLow).mul(new BN(1e8));

      return gasPrice;
    } catch (err) {
      throw new Error(`getGasPrice: ${err}`);
    }
  }

  /**
   *
   * @returns {number} - REP price in ETH
   */
  public async getRepEthPrice(): Promise<number> {
    try {
      const res = await fetch('https://min-api.cryptocompare.com/data/price?fsym=REP&tsyms=ETH');
      const resJSON = await res.json() as { ETH: number };
      const repEthPrice = resJSON.ETH;

      return repEthPrice;
    } catch (err) {
      throw new Error(`getRepEthPrice: ${err}`);
    }
  }

  /**
   *
   * @returns {Promise<FeeWindow>} - The current fee window info
   */
  public async getCurrentFeeWindow(): Promise<FeeWindow> {
    try {
      const address = await this.universeContract.methods.getCurrentFeeWindow().call() as string;
      return this.getFeeWindow(address, false);
    } catch (err) {
      throw new Error(`getCurrentFeeWindow: ${err}`);
    }
  }

  /**
   *
   * @returns {Promise<FeeWindow>} - The next fee window info
   */
  public async getNextFeeWindow(): Promise<FeeWindow> {
    try {
      const address = await this.universeContract.methods.getNextFeeWindow().call() as string;
      return this.getFeeWindow(address, false);
    } catch (err) {
      throw new Error(`getNextFeeWindow: ${err}`);
    }
  }

  /**
   * Caution: this method needs a lot of requests and therefore may be slow
   * @returns {Promise<FeeWindow>} - The previous fee window info
   */
  public async getPreviousFeeWindow(): Promise<FeeWindow> {
    try {
      const address = await this.universeContract.methods.getPreviousFeeWindow().call() as string;
      return this.getFeeWindow(address);
    } catch (err) {
      throw new Error(`getPreviousFeeWindow: ${err}`);
    }
  }

  public divBN(a: BN, b: BN): number {
    if (a.eqn(0)) {
      return 0;
    }
    if (a.lt(b)) {
      return 1 / this.divBN(b, a);
    }
    if (b.ltn(0)) {
      return - this.divBN(a, b.ineg());
    }
    if (a.bitLength() > 53) {
      return a.div(b).toNumber() + this.divBN(a.mod(b), b);
    }
    return a.toNumber() / b.toNumber();
  }


  /**
   * Calculates some profit values for the given input parameter
   * @param {BN} fees - The fees in the fee window in Wei
   * @param {BN} gasPrice - The gas price in Wei
   * @param {BN} gasUsed - The used gas for both transactions (buying participation tokens and redeeming)
   * @param {BN} rep - The number of used REP in Wei (10^(-18) REP)
   * @param {number} repEthPrice the REP-ETH price
   * @param {BN} stake the stake in the fee window in Wei(REP)
   * @returns {ParticipationRentabilityResult}
   */
  public calculateParticipationRentability(fees: BN,
                                                 gasPrice: BN,
                                                 gasUsed: BN,
                                                 rep: BN,
                                                 repEthPrice: number,
                                                 stake: BN): ParticipationRentabilityResult {
    const gasCost = gasPrice.mul(gasUsed);
    const totalFeeProfit = fees.mul(rep).div(stake.add(rep));
    const totalProfit = totalFeeProfit.sub(gasCost);
    const profitPerRep = this.divBN(totalProfit, rep);
    const profitPercent = 1 / (this.divBN(gasCost, totalProfit) + this.divBN(rep, totalProfit) * repEthPrice);
    const profitPercentPA = Math.pow(profitPercent + 1, 365 / 7) - 1;
    const gasPriceBreakEven = totalFeeProfit.div(gasUsed);
    const divisor = fees.sub(gasCost);
    let numRepBreakEven = new BN(NaN);
    let numRepMaxProfitPerRep = new BN(0);
    if (divisor.gtn(0)) {
      numRepBreakEven = gasCost.mul(stake).subn(1).div(divisor).addn(1); //rounding gasCost * stake / divisor up
      numRepMaxProfitPerRep = numRepBreakEven.add(numRepBreakEven.mul(numRepBreakEven.add(stake)).pow(new BN(0.5)));
    }
    return {
      gasCost,
      totalFeeProfit,
      totalProfit,
      profitPerRep,
      profitPercent,
      profitPercentPA,
      numRepBreakEven,
      gasPriceBreakEven,
      numRepMaxProfitPerRep,
    };
  }

  /**
   * Caution: If the fee window is over this method needs a lot of requests and therefore may be slow.
   * @param {string} address The address of the fee window to get
   * @param {boolean} isOver True, iff the fee window is over
   * @returns {Promise<FeeWindow>}
   */
  public async getFeeWindow(address: string, isOver: boolean = true): Promise<FeeWindow> {
    try {
      const feeWindowContract = new this.web3.eth.Contract(feeWindowABI, address);
      let [strBalance, strTotalFeeStake, strEndTime] = ["0", "0", "0"];
      if (isOver) {
        //get historic view of the fee window
        strEndTime = await feeWindowContract.methods.getEndTime().call();
        const intEndTime = parseInt(strEndTime);
        const span = (new Date()).valueOf() - intEndTime * 1000;
        if (span <= 0) {
          throw new Error("The fee window is not over yet!");
        }
        const currentBlockNumber = await this.web3.eth.getBlockNumber();
        let numBlocks = Math.round(span / 1000 / 15); //assume blocks need in average 15 seconds
        if (numBlocks < 10) {
          numBlocks = 10; //get at least 10 blocks
        }
        const blockNumber = await this.binarySearch(intEndTime, 0, currentBlockNumber, numBlocks);

        //small hack because of type problems (see also https://github.com/ethereum/web3.js/issues/1287)
        const balanceOfMethod = this.cashContract.methods.balanceOf(address) as any;
        const getTotalFeeStakeMethod = feeWindowContract.methods.getTotalFeeStake() as any;
        [strBalance, strTotalFeeStake] = await Promise.all([
          balanceOfMethod.call(undefined, blockNumber),
          getTotalFeeStakeMethod.call(undefined, blockNumber)
        ]);
      } else {
        [strBalance, strTotalFeeStake, strEndTime] = await Promise.all([
          this.cashContract.methods.balanceOf(address).call(),
          feeWindowContract.methods.getTotalFeeStake().call(),
          feeWindowContract.methods.getEndTime().call()
        ]);
      }
      const balance = this.web3.utils.toBN(strBalance);
      const totalFeeStake = this.web3.utils.toBN(strTotalFeeStake);
      const endTime = new Date(parseInt(strEndTime) * 1000);
      return {
        address,
        balance,
        totalFeeStake,
        endTime
      };
    } catch (err) {
      throw new Error(`getFeeWindow: ${err}`);
    }
  }

  /**
   * Binary searching a block number
   * @param {number} target timestamp
   * @param {number} lowerBound timestamp
   * @param {number} upperBound timestamp
   * @param {number} numBlocks the number of blocks to step back if the lower bound is still to high
   * @returns {Promise<number>} The last block which was before or exactly at the time given by target
   */
  private async binarySearch(target: number,
                             lowerBound: number,
                             upperBound: number,
                             numBlocks: number): Promise<number> {
    if (upperBound < lowerBound) {
      return upperBound;
    }

    let nextTest = 0;
    if (lowerBound === 0) {
      nextTest = upperBound - numBlocks;
    } else {
      nextTest = Math.floor((upperBound + lowerBound) / 2);
    }
    const block = await this.web3.eth.getBlock(nextTest, false);
    let time = block.timestamp;
    let lBound = lowerBound;
    let uBound = upperBound;
    if (time > target) {
      uBound = nextTest - 1;
    } else {
      lBound = nextTest + 1;
    }
    return this.binarySearch(target, lBound, uBound, numBlocks);
  }
}